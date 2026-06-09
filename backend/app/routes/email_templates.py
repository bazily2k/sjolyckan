from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.models.database import get_db
from app.models.models import User, Booking
from app.models.email_template import EmailTemplate
from app.core.auth import require_admin

router = APIRouter(prefix="/api/admin/email-templates", tags=["email-templates"])


class TemplateCreate(BaseModel):
    name: str
    trigger: str = "manual"
    recipient: str = "guest"
    is_active: bool = True
    subject_sv: str = ""
    subject_en: str = ""
    subject_de: str = ""
    body_sv: str = ""
    body_en: str = ""
    body_de: str = ""


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    trigger: Optional[str] = None
    recipient: Optional[str] = None
    is_active: Optional[bool] = None
    subject_sv: Optional[str] = None
    subject_en: Optional[str] = None
    subject_de: Optional[str] = None
    body_sv: Optional[str] = None
    body_en: Optional[str] = None
    body_de: Optional[str] = None


def _tmpl_dict(t: EmailTemplate) -> dict:
    return {
        "id": t.id, "name": t.name, "trigger": t.trigger,
        "recipient": t.recipient, "is_active": t.is_active,
        "is_system": t.is_system, "sort_order": t.sort_order,
        "subject_sv": t.subject_sv, "subject_en": t.subject_en, "subject_de": t.subject_de,
        "body_sv": t.body_sv, "body_en": t.body_en, "body_de": t.body_de,
    }


@router.get("")
def list_templates(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    templates = db.query(EmailTemplate).order_by(
        EmailTemplate.is_system.desc(), EmailTemplate.sort_order, EmailTemplate.id
    ).all()
    return [_tmpl_dict(t) for t in templates]


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mall hittades inte")
    return _tmpl_dict(t)


@router.post("")
def create_template(data: TemplateCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = EmailTemplate(**data.dict(), is_system=False)
    db.add(t); db.commit(); db.refresh(t)
    return _tmpl_dict(t)


@router.put("/{template_id}")
def update_template(template_id: int, data: TemplateUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mall hittades inte")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit(); db.refresh(t)
    return _tmpl_dict(t)


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mall hittades inte")
    if t.is_system:
        raise HTTPException(status_code=400, detail="Systemmallar kan inte tas bort")
    db.delete(t); db.commit()
    return {"ok": True}


@router.post("/{template_id}/toggle")
def toggle_template(template_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mall hittades inte")
    t.is_active = not t.is_active
    db.commit()
    return {"is_active": t.is_active}


@router.post("/{template_id}/reset")
def reset_template(template_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Återställ systemmall till filinnehåll."""
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t or not t.is_system:
        raise HTTPException(status_code=400, detail="Endast systemmallar kan återställas")
    from app.email.service import SUBJECTS, template_dir
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader(str(template_dir)))
    for lang in ("sv", "en", "de"):
        try:
            tmpl_src = env.loader.get_source(env, f"{t.trigger}_{lang}.html")[0]
            setattr(t, f"body_{lang}", tmpl_src)
        except Exception:
            pass
        subj = SUBJECTS.get(t.trigger, {}).get(lang, "")
        setattr(t, f"subject_{lang}", subj)
    db.commit(); db.refresh(t)
    return _tmpl_dict(t)


@router.post("/{template_id}/send/{booking_id}")
async def send_manual_template(
    template_id: int,
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Skicka en manuell mall till gästen för en specifik bokning."""
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id, EmailTemplate.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Mall hittades inte eller inaktiv")
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    from app.email.service import send_email, log_email
    from jinja2 import Environment
    from app.core.config import settings

    lang = booking.lang or "sv"
    body_src = getattr(t, f"body_{lang}") or getattr(t, "body_sv") or ""
    subject  = getattr(t, f"subject_{lang}") or getattr(t, "subject_sv") or t.name

    snap = booking.snapshot or {}
    ctx = {
        "booking": booking, "snap": snap, "lang": lang,
        "frontend_url": settings.FRONTEND_URL,
        "admin_email": settings.ADMIN_EMAIL,
    }
    env = Environment(autoescape=False)
    try:
        html = env.from_string(body_src).render(**ctx)
        subject = env.from_string(subject).render(**ctx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mallfel: {e}")

    if t.recipient == "admin":
        recipient = settings.ADMIN_EMAIL
    else:
        recipient = (booking.user.email if booking.user_id and booking.user else None) or booking.guest_email

    ok = await send_email(recipient, subject, html)
    log_email(db, booking.id, f"manual:{t.name}", recipient, lang, subject, "sent" if ok else "failed")
    if not ok:
        raise HTTPException(status_code=500, detail="Mejlet kunde inte skickas")
    return {"ok": True, "recipient": recipient}
