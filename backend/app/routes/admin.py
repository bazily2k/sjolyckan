from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from app.models.database import get_db
from app.models.models import Season, Article, PriceOverride, Setting, User
from app.core.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ══════════════════════════════════════════════════════════
# SÄSONGER
# ══════════════════════════════════════════════════════════
class SeasonSchema(BaseModel):
    name_sv: str
    name_en: str
    name_de: str
    date_from: date
    date_to: date
    price_per_night: float
    deposit_pct: float = 10.0
    deposit_days: int = 7
    payment_days_before: int = 60
    min_nights: int = 2
    extra_guest_fee: float = 0
    extra_guest_threshold: int = 4
    reminder_1_days: int = 14
    reminder_2_days: int = 3
    visible: bool = True
    active: bool = True
    sort_order: int = 0


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(Season).order_by(Season.date_from).all()


@router.post("/seasons")
def create_season(data: SeasonSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = Season(**data.dict())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/seasons/{season_id}")
def update_season(season_id: int, data: SeasonSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = db.query(Season).filter(Season.id == season_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Säsong hittades inte")
    for k, v in data.dict().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.patch("/seasons/{season_id}/toggle")
def toggle_season(season_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = db.query(Season).filter(Season.id == season_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Säsong hittades inte")
    s.active = not s.active
    db.commit()
    return {"active": s.active}


@router.delete("/seasons/{season_id}")
def delete_season(season_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = db.query(Season).filter(Season.id == season_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Säsong hittades inte")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════
# PRISÖVERSTYRING (enskilda datum)
# ══════════════════════════════════════════════════════════
class OverrideSchema(BaseModel):
    date: date
    price_per_night: float
    min_nights: Optional[int] = None
    extra_guest_fee: Optional[float] = None
    extra_guest_threshold: Optional[int] = None
    note: Optional[str] = None
    active: bool = True


@router.get("/price-overrides")
def list_overrides(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(PriceOverride).order_by(PriceOverride.date).all()


@router.post("/price-overrides")
def create_override(data: OverrideSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    existing = db.query(PriceOverride).filter(PriceOverride.date == data.date).first()
    if existing:
        for k, v in data.dict().items():
            setattr(existing, k, v)
        db.commit()
        return existing
    o = PriceOverride(**data.dict())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


@router.delete("/price-overrides/{override_id}")
def delete_override(override_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    o = db.query(PriceOverride).filter(PriceOverride.id == override_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Hittades inte")
    db.delete(o)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════
# ARTIKLAR / TILLÄGG
# ══════════════════════════════════════════════════════════
class ArticleSchema(BaseModel):
    name_sv: str
    name_en: str
    name_de: str
    desc_sv: Optional[str] = ""
    desc_en: Optional[str] = ""
    desc_de: Optional[str] = ""
    price: float
    price_type: str = "per_night"  # per_night | per_guest | fixed
    icon: str = "ti-package"
    visible: bool = True
    bookable: bool = True
    sort_order: int = 0
    active: bool = True


@router.get("/articles")
def list_articles(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(Article).order_by(Article.sort_order, Article.id).all()


@router.post("/articles")
def create_article(data: ArticleSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = Article(**data.dict())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.put("/articles/{article_id}")
def update_article(article_id: int, data: ArticleSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Artikel hittades inte")
    for k, v in data.dict().items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a


@router.patch("/articles/{article_id}/toggle-visible")
def toggle_article_visible(article_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Artikel hittades inte")
    a.visible = not a.visible
    db.commit()
    return {"visible": a.visible}


@router.patch("/articles/{article_id}/toggle-bookable")
def toggle_article_bookable(article_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Artikel hittades inte")
    a.bookable = not a.bookable
    db.commit()
    return {"bookable": a.bookable}


@router.delete("/articles/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Artikel hittades inte")
    a.active = False  # Soft delete — bevarar historik i gamla bokningar
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════
# GLOBALA INSTÄLLNINGAR
# ══════════════════════════════════════════════════════════
@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    settings_list = db.query(Setting).all()
    return {s.key: s.value for s in settings_list}


@router.put("/settings/{key}")
def update_setting(key: str, value: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = db.query(Setting).filter(Setting.key == key).first()
    if s:
        s.value = value
    else:
        s = Setting(key=key, value=value)
        db.add(s)
    db.commit()
    return {"key": key, "value": value}


# ─── E-postlogg ──────────────────────────────────────
@router.get("/email-logs")
def get_email_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import EmailLog, Booking
    logs = db.query(EmailLog, Booking).join(
        Booking, EmailLog.booking_id == Booking.id
    ).order_by(EmailLog.sent_at.desc()).limit(200).all()
    return [{
        "id": log.id,
        "booking_id": log.booking_id,
        "booking_ref": booking.booking_ref,
        "guest_name": booking.guest_name,
        "email_type": log.email_type,
        "recipient": log.recipient,
        "lang": log.lang,
        "subject": log.subject,
        "status": log.status,
        "error": log.error,
        "sent_at": str(log.sent_at),
    } for log, booking in logs]