from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.database import get_db
from app.models.models import User, UserRole
from app.core.auth import (
    verify_password, hash_password, create_access_token,
    validate_password_strength, get_current_user, require_superadmin, require_admin
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    country: str = "SE"
    lang: str = "sv"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CreateStaffRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    role: UserRole = UserRole.staff


# ─── Registrera gästkonto ───────────────────────────────
@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Kontrollera lösenordsstyrka
    strength = validate_password_strength(req.password)
    if not strength["ok"]:
        raise HTTPException(status_code=400, detail=strength["message"])

    # Kontrollera om email finns
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen är redan registrerad")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        phone=req.phone,
        country=req.country,
        lang=req.lang,
        role=UserRole.guest,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "role": user.role.value}


# ─── Logga in ───────────────────────────────────────────
@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active == True).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role.value,
        "first_name": user.first_name,
    }


# ─── Hämta inloggad användare ───────────────────────────
@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role.value,
        "lang": user.lang,
        "country": user.country,
        "phone": user.phone,
        "address_line1": user.address_line1,
        "address_line2": user.address_line2,
        "postal_code": user.postal_code,
        "city": user.city,
    }


# ─── Admin: Skapa personal/admin-konto ──────────────────
@router.post("/admin/create-staff")
def create_staff(
    req: CreateStaffRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    strength = validate_password_strength(req.password)
    if not strength["ok"]:
        raise HTTPException(status_code=400, detail=strength["message"])

    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen är redan registrerad")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        role=req.role,
    )
    db.add(user)
    db.commit()
    return {"ok": True, "email": user.email, "role": user.role.value}


# ─── Admin: Lista alla användare ────────────────────────
@router.get("/admin/users")
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    total = db.query(User).count()
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return {
        'items': [
            {
                "id": u.id,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "role": u.role.value,
                "is_active": u.is_active,
                "created_at": str(u.created_at),
                "last_login": str(u.last_login) if u.last_login else None,
                "discount_pct": float(u.discount_pct) if u.discount_pct else 0,
                "phone": u.phone or "",
                "address_line1": u.address_line1 or "",
                "address_line2": u.address_line2 or "",
                "postal_code": u.postal_code or "",
                "city": u.city or "",
                "country": u.country or "SE",
                "lang": u.lang or "sv",
            }
            for u in users
        ],
        'total': total,
        'skip': skip,
        'limit': limit,
    }


# ─── Uppdatera profil ────────────────────────────────────
@router.put("/me")
def update_profile(
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "phone" in data:
        user.phone = data["phone"]
    if "country" in data:
        user.country = data["country"]
    if "address_line1" in data:
        user.address_line1 = data["address_line1"]
    if "address_line2" in data:
        user.address_line2 = data["address_line2"]
    if "postal_code" in data:
        user.postal_code = data["postal_code"]
    if "city" in data:
        user.city = data["city"]
    db.commit()
    return {"ok": True}


# ─── Byt lösenord ────────────────────────────────────────
@router.post("/change-password")
def change_password(
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import bcrypt as _bcrypt
    current = data.get("current_password", "")
    new_pass = data.get("new_password", "")
    if not _bcrypt.checkpw(current.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=400, detail="Fel nuvarande lösenord")
    strength = validate_password_strength(new_pass)
    if not strength["ok"]:
        raise HTTPException(status_code=400, detail=strength["message"])
    user.password_hash = hash_password(new_pass)
    db.commit()
    return {"ok": True}


# ─── Uppdatera profil ────────────────────────────────────
@router.put("/me")
def update_profile(
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "phone" in data:
        user.phone = data["phone"]
    if "country" in data:
        user.country = data["country"]
    if "address_line1" in data:
        user.address_line1 = data["address_line1"]
    if "address_line2" in data:
        user.address_line2 = data["address_line2"]
    if "postal_code" in data:
        user.postal_code = data["postal_code"]
    if "city" in data:
        user.city = data["city"]
    db.commit()
    return {"ok": True}


# ─── Byt lösenord ────────────────────────────────────────
@router.post("/change-password")
def change_password(
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import bcrypt as _bcrypt
    current = data.get("current_password", "")
    new_pass = data.get("new_password", "")
    if not _bcrypt.checkpw(current.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=400, detail="Fel nuvarande lösenord")
    strength = validate_password_strength(new_pass)
    if not strength["ok"]:
        raise HTTPException(status_code=400, detail=strength["message"])
    user.password_hash = hash_password(new_pass)
    db.commit()
    return {"ok": True}


# ─── Admin: Uppdatera användarroll ───────────────────
@router.patch("/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    new_role = data.get("role")
    try:
        user.role = UserRole(new_role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Ogiltig roll: {new_role}")
    db.commit()
    return {"ok": True, "role": new_role}


# ─── Admin: Uppdatera användarrabatt ───────────────────
@router.patch("/admin/users/{user_id}/discount")
def admin_update_user_discount(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    if "discount_pct" in data:
        user.discount_pct = data["discount_pct"]
    db.commit()
    return {"ok": True, "discount_pct": float(user.discount_pct) if user.discount_pct else 0}


# ─── Admin: Uppdatera användarroll ───────────────────
@router.patch("/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    new_role = data.get("role")
    try:
        user.role = UserRole(new_role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Ogiltig roll: {new_role}")
    db.commit()
    return {"ok": True, "role": new_role}


# ─── Admin: Uppdatera användarrabatt ───────────────────
@router.patch("/admin/users/{user_id}/discount")
def admin_update_user_discount(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    if "discount_pct" in data:
        user.discount_pct = data["discount_pct"]
    db.commit()
    return {"ok": True, "discount_pct": float(user.discount_pct) if user.discount_pct else 0}


# ─── Glömt lösenord ─────────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(data: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    import secrets
    from datetime import datetime, timedelta
    email = data.get("email", "").strip().lower()
    request_lang = data.get("lang", None)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": "Om e-postadressen finns registrerad skickas en återställningslänk."}
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=24)
    db.commit()
    from app.core.config import settings as app_settings
    lang = request_lang or user.lang or "sv"
    reset_url = f"{app_settings.FRONTEND_URL}/reset-password/{token}"
    subjects = {
        "sv": "Återställ ditt lösenord — Sjölyckan",
        "en": "Reset your password — Sjölyckan",
        "de": "Passwort zurücksetzen — Sjölyckan",
    }
    greetings = {
        "sv": f"Hej {user.first_name or ''}",
        "en": f"Hello {user.first_name or ''}",
        "de": f"Hallo {user.first_name or ''}",
    }
    bodies = {
        "sv": f"Klicka på länken nedan för att återställa ditt lösenord. Länken är giltig i 24 timmar.",
        "en": f"Click the link below to reset your password. The link is valid for 24 hours.",
        "de": f"Klicken Sie auf den Link unten, um Ihr Passwort zurückzusetzen. Der Link ist 24 Stunden gültig.",
    }
    ignores = {
        "sv": "Om du inte begärde detta kan du ignorera detta mail.",
        "en": "If you did not request this, you can ignore this email.",
        "de": "Wenn Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.",
    }
    from app.email.service import send_simple_email
    background_tasks.add_task(
        send_simple_email, db,
        to_email=email,
        subject=subjects.get(lang, subjects["en"]),
        html=f"""<p>{greetings.get(lang, greetings["en"])},</p>
<p>{bodies.get(lang, bodies["en"])}</p>
<p><a href="{reset_url}">{reset_url}</a></p>
<p>{ignores.get(lang, ignores["en"])}</p>
<p>Sjölyckan, Rolsmo</p>"""
    )
    return {"message": "Om e-postadressen finns registrerad skickas en återställningslänk."}


def _pw_policy_msg(lang):
    return {
        "en": "Password must be at least 10 characters and include uppercase and lowercase letters, a number and a special character.",
        "de": "Das Passwort muss mindestens 10 Zeichen lang sein und Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen enthalten.",
    }.get(lang, "Lösenordet måste vara minst 10 tecken och innehålla stora och små bokstäver, siffror och specialtecken.")


@router.post("/reset-password")
def reset_password(data: dict, db: Session = Depends(get_db)):
    from datetime import datetime
    token = data.get("token", "")
    new_password = data.get("password", "")
    lang = data.get("lang") or "sv"
    if not validate_password_strength(new_password)["ok"]:
        raise HTTPException(status_code=400, detail=_pw_policy_msg(lang))
    user = db.query(User).filter(User.reset_token == token).first()
    if not user or not user.reset_token_expires:
        raise HTTPException(status_code=400, detail="Ogiltig eller utgången länk")
    if user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Länken har gått ut")
    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "Lösenordet har återställts"}


# ─── Admin: uppdatera användare ─────────────────────────
@router.put("/admin/users/{user_id}")
def admin_update_user(user_id: int, data: dict, db: Session = Depends(get_db), actor: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    if user.role == UserRole.admin and actor.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Endast admin kan ändra admin-konton")
    for field in ["first_name", "last_name", "phone", "country", "address_line1", "address_line2", "postal_code", "city"]:
        if field in data:
            setattr(user, field, data[field])
    if "email" in data and data["email"] != user.email:
        existing = db.query(User).filter(User.email == data["email"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="E-postadressen används redan")
        user.email = data["email"]
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "first_name": user.first_name, "last_name": user.last_name}


# ─── Admin: återställ lösenord ───────────────────────────
@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, data: dict, db: Session = Depends(get_db), actor: User = Depends(require_admin)):
    from app.core.auth import hash_password
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    if user.role == UserRole.admin and actor.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Endast admin kan återställa lösenord för admin-konton")
    new_password = data.get("password", "")
    if not validate_password_strength(new_password)["ok"]:
        raise HTTPException(status_code=400, detail=_pw_policy_msg(actor.lang or "sv"))
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"message": "Lösenordet har återställts"}
