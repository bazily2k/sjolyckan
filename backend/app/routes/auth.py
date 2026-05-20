from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.database import get_db
from app.models.models import User, UserRole
from app.core.auth import (
    verify_password, hash_password, create_access_token,
    validate_password_strength, get_current_user, require_superadmin
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
