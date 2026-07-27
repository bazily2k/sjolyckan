from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from app.models.database import get_db
from app.models.models import Season, Article, PriceOverride, Setting, User, EmailLog, Booking, BookingStatus, CheckinInfoItem
from app.core.auth import require_admin
from app.core.config import settings
from app.routes.cms import save_upload

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ResendEmailRequest(BaseModel):
    email_type: str = "booking_confirmed"


@router.get("/email-health")
def admin_email_health(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Antal misslyckade mejl de senaste 7 dagarna."""
    from datetime import datetime, timedelta
    since = datetime.utcnow() - timedelta(days=7)
    failed = db.query(EmailLog).filter(
        EmailLog.status == "failed",
        EmailLog.sent_at >= since
    ).count()
    total = db.query(EmailLog).filter(
        EmailLog.sent_at >= since
    ).count()
    return {"failed_7d": int(failed), "total_7d": int(total)}


@router.post("/bookings/{booking_id}/resend-email")
async def resend_booking_email_direct(
    booking_id: int,
    payload: ResendEmailRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Skicka om ett specifikt mejl för en bokning."""
    from app.email.service import send_booking_email
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    to_admin = payload.email_type.startswith("admin_")
    ok = await send_booking_email(db, booking, payload.email_type, to_admin=to_admin)
    if ok:
        return {"status": "sent", "email_type": payload.email_type}
    raise HTTPException(status_code=500, detail="Mejlet kunde inte skickas")


@router.post("/bookings/{booking_id}/resend-verify-email")
async def resend_verify_email(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Skicka om verifieringsmail för en bokning som väntar på e-bekräftelse."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.routes.bookings import _send_email_verify
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    if booking.status != BookingStatus.pending_email_verify:
        raise HTTPException(status_code=400, detail="Bokningen väntar inte på e-postbekräftelse")
    booking.email_verify_token = secrets.token_urlsafe(32)
    booking.email_verify_expires = datetime.now(timezone.utc) + timedelta(hours=48)
    booking.email_verify_reminder_sent = False
    db.commit()
    await _send_email_verify(booking.id)
    return {"status": "sent", "booking_ref": booking.booking_ref}


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
    cancellation_deposit_days: int = 120
    cancellation_full_days: int = 60
    cancellation_refund_deposit: bool = False
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
    is_deposit: bool = False
    is_pet_fee: bool = False
    sort_order: int = 0
    active: bool = True


class CheckinInfoSchema(BaseModel):
    title_sv: str
    title_en: Optional[str] = ""
    title_de: Optional[str] = ""
    body_sv: Optional[str] = ""
    body_en: Optional[str] = ""
    body_de: Optional[str] = ""
    icon: Optional[str] = ""
    item_type: str = "static"
    image_path: Optional[str] = ""
    active: bool = True
    sort_order: int = 0


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


# ─── Incheckningsinfo-punkter (egna infoblock i incheckningsmailet) ───
@router.get("/checkin-info")
def list_checkin_info(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(CheckinInfoItem).order_by(CheckinInfoItem.sort_order, CheckinInfoItem.id).all()


@router.post("/checkin-info")
def create_checkin_info(data: CheckinInfoSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = CheckinInfoItem(**data.dict())
    db.add(item); db.commit(); db.refresh(item)
    return item


@router.put("/checkin-info/{item_id}")
def update_checkin_info(item_id: int, data: CheckinInfoSchema, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(CheckinInfoItem).filter(CheckinInfoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Punkt hittades inte")
    for k, v in data.dict().items():
        setattr(item, k, v)
    db.commit(); db.refresh(item)
    return item


@router.patch("/checkin-info/{item_id}/toggle")
def toggle_checkin_info(item_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(CheckinInfoItem).filter(CheckinInfoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Punkt hittades inte")
    item.active = not item.active
    db.commit()
    return {"active": item.active}


@router.delete("/checkin-info/{item_id}")
def delete_checkin_info(item_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(CheckinInfoItem).filter(CheckinInfoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Punkt hittades inte")
    db.delete(item); db.commit()
    return {"ok": True}


@router.post("/checkin-info/{item_id}/image")
def upload_checkin_image(item_id: int, image: UploadFile = File(...),
                         db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(CheckinInfoItem).filter(CheckinInfoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Punkt hittades inte")
    item.image_path = save_upload(image, "checkin")
    db.commit()
    return {"ok": True, "image_path": item.image_path}


@router.delete("/checkin-info/{item_id}/image")
def delete_checkin_image(item_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(CheckinInfoItem).filter(CheckinInfoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Punkt hittades inte")
    item.image_path = ""
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

# ─── Radera e-postlogg ───────────────────────────────
@router.delete("/email-logs/{log_id}")
def delete_email_log(
    log_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import EmailLog
    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Logg hittades inte")
    db.delete(log)
    db.commit()
    return {"ok": True}


# ─── Radera alla e-postloggar ────────────────────────
@router.delete("/email-logs")
def delete_all_email_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import EmailLog
    db.query(EmailLog).delete()
    db.commit()
    return {"ok": True}

# ─── Blockerade datum ─────────────────────────────────
@router.get("/blocked-dates")
def list_blocked_dates(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import BlockedDate
    blocks = db.query(BlockedDate).order_by(BlockedDate.date_from).all()
    return [_blocked_dict(b) for b in blocks]

def _blocked_dict(b) -> dict:
    return {
        "id": b.id, "date_from": str(b.date_from), "date_to": str(b.date_to), "reason": b.reason,
        "agent_id": b.agent_id, "agent_name": b.agent.name if b.agent_id and b.agent else None,
        "guest_name": b.guest_name, "guest_email": b.guest_email, "guest_phone": b.guest_phone,
        "guest_country": b.guest_country, "adults_count": b.adults_count,
        "children_count": b.children_count, "pets_count": b.pets_count,
        "articles": b.articles or [],
    }

@router.post("/blocked-dates")
def create_blocked_date(
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import BlockedDate, Agent
    agent_id = data.get("agent_id") or None
    if agent_id and not db.query(Agent).filter(Agent.id == agent_id).first():
        raise HTTPException(status_code=400, detail="Okänd förmedlare")
    b = BlockedDate(
        date_from=date.fromisoformat(data["date_from"]),
        date_to=date.fromisoformat(data["date_to"]),
        reason=data.get("reason", ""),
        agent_id=agent_id,
        guest_name=data.get("guest_name") or None,
        guest_email=data.get("guest_email") or None,
        guest_phone=data.get("guest_phone") or None,
        guest_country=data.get("guest_country") or None,
        adults_count=data.get("adults_count"),
        children_count=data.get("children_count"),
        pets_count=data.get("pets_count"),
        articles=data.get("articles") or [],
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _blocked_dict(b)

@router.put("/blocked-dates/{block_id}")
def update_blocked_date(
    block_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import BlockedDate, Agent
    b = db.query(BlockedDate).filter(BlockedDate.id == block_id).first()
    if not b: raise HTTPException(status_code=404, detail="Hittades inte")
    if "agent_id" in data and data["agent_id"]:
        if not db.query(Agent).filter(Agent.id == data["agent_id"]).first():
            raise HTTPException(status_code=400, detail="Okänd förmedlare")
    for field in ("date_from", "date_to", "reason", "agent_id", "guest_name",
                  "guest_email", "guest_phone", "guest_country",
                  "adults_count", "children_count", "pets_count", "articles"):
        if field in data: setattr(b, field, data[field] or ([] if field == "articles" else None))
    db.commit(); db.refresh(b)
    return _blocked_dict(b)

@router.delete("/blocked-dates/{block_id}")
def delete_blocked_date(
    block_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import BlockedDate
    b = db.query(BlockedDate).filter(BlockedDate.id == block_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Hittades inte")
    db.delete(b)
    db.commit()
    return {"ok": True}

# ─── Förmedlare ─────────────────────────────────────────
def _agent_dict(a) -> dict:
    return {
        "id": a.id, "name": a.name, "url": a.url, "notes": a.notes,
        "contacts": a.contacts or [], "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }

@router.get("/agents")
def list_agents(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import Agent
    agents = db.query(Agent).order_by(Agent.name).all()
    return [_agent_dict(a) for a in agents]

@router.post("/agents")
def create_agent(data: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import Agent
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="Namn krävs")
    contacts = data.get("contacts") or []
    _validate_contacts(contacts)
    a = Agent(
        name=data["name"], url=data.get("url"), notes=data.get("notes"),
        contacts=contacts, is_active=data.get("is_active", True),
    )
    db.add(a); db.commit(); db.refresh(a)
    return _agent_dict(a)

@router.put("/agents/{agent_id}")
def update_agent(agent_id: int, data: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import Agent
    a = db.query(Agent).filter(Agent.id == agent_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Hittades inte")
    if "contacts" in data:
        _validate_contacts(data["contacts"] or [])
    for field in ("name", "url", "notes", "contacts", "is_active"):
        if field in data:
            setattr(a, field, data[field])
    db.commit(); db.refresh(a)
    return _agent_dict(a)

@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import Agent, BlockedDate
    a = db.query(Agent).filter(Agent.id == agent_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Hittades inte")
    in_use = db.query(BlockedDate).filter(BlockedDate.agent_id == agent_id).count()
    if in_use > 0:
        raise HTTPException(status_code=400, detail=f"Förmedlaren används av {in_use} blockering(ar) och kan inte tas bort. Avaktivera den istället.")
    db.delete(a)
    db.commit()
    return {"ok": True}

def _validate_contacts(contacts: list):
    if not isinstance(contacts, list):
        raise HTTPException(status_code=400, detail="Kontaktpersoner måste vara en lista")
    primaries = sum(1 for c in contacts if c.get("is_primary"))
    if primaries > 1:
        raise HTTPException(status_code=400, detail="Endast en kontaktperson kan vara huvudkontakt")

# ─── Skicka om e-post ───────────────────────────────────
@router.post("/email-logs/{log_id}/resend")
async def resend_email(
    log_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import EmailLog, Booking
    from app.email.service import send_booking_email

    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Loggpost hittades inte")

    booking = db.query(Booking).filter(Booking.id == log.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    # Använd e-posttyp för att avgöra admin/gäst
    to_admin = log.email_type.startswith("admin_") or log.recipient == settings.ADMIN_EMAIL
    actual_recipient = settings.ADMIN_EMAIL if to_admin else (
        (booking.user.email if booking.user_id and booking.user else None) or booking.guest_email
    )

    # Kontrollera om adressen är känd-studsad (suppression-lista-skydd)
    from datetime import datetime, timedelta
    recent_bounce = db.query(EmailLog).filter(
        EmailLog.recipient == actual_recipient,
        EmailLog.status == "bounced",
        EmailLog.sent_at >= datetime.utcnow() - timedelta(days=30),
    ).first()

    if recent_bounce:
        # Skapa ny loggpost som misslyckat direkt — adressen är på suppression-lista
        new_log = EmailLog(
            booking_id=log.booking_id,
            email_type=log.email_type,
            recipient=actual_recipient,
            lang=log.lang,
            subject=log.subject,
            status="failed",
            error=f"Adressen har studsat tidigare ({recent_bounce.error or 'bounce'})",
        )
        db.add(new_log)
        db.commit()
        return {
            "status": "bounced",
            "recipient": actual_recipient,
            "warning": f"Adressen {actual_recipient} har studsat tidigare. Rätta adressen innan du skickar om.",
        }

    ok = await send_booking_email(db, booking, log.email_type, to_admin=to_admin)
    if ok:
        log.status = "sent"
        log.error = None
        log.sent_at = datetime.utcnow()
        log.recipient = actual_recipient
        db.commit()
        return {"status": "sent", "recipient": actual_recipient}
    raise HTTPException(status_code=500, detail="Misslyckades skicka mail")


# ─── Generera PDF för villkor/GDPR ──────────────────────
@router.get("/pdf/{doc_type}")
async def generate_pdf(
    doc_type: str,
    lang: str = "sv",
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.cms_models import ContentBlock
    from app.core.config import settings as app_settings
    from jinja2 import Environment
    from fastapi.responses import Response

    if doc_type not in ("terms", "gdpr"):
        raise HTTPException(status_code=400, detail="Ogiltigt dokumenttyp")

    key = "terms_text" if doc_type == "terms" else "gdpr_text"
    block = db.query(ContentBlock).filter(ContentBlock.key == key).first()
    if not block:
        raise HTTPException(status_code=404, detail="Innehåll hittades inte")

    lang_map = {"sv": "value_sv", "en": "value_en", "de": "value_de"}
    field = lang_map.get(lang, "value_sv")
    raw = getattr(block, field, "") or ""

    # Hämta säsongsdata för rendering
    from app.models.models import Season
    season = db.query(Season).filter(Season.active == True).first()
    ctx = {
        "snap": {
            "deposit_pct": float(season.deposit_pct) if season else 10,
            "deposit_days": season.deposit_days if season else 7,
            "payment_days_before": season.payment_days_before if season else 60,
        },
        "admin_email": app_settings.ADMIN_EMAIL,
    }
    try:
        content_html = Environment().from_string(raw).render(**ctx)
    except Exception:
        content_html = raw

    titles = {
        "terms": {"sv": "Bokningsvillkor", "en": "Booking Terms", "de": "Buchungsbedingungen"},
        "gdpr":  {"sv": "Personuppgiftshantering", "en": "Privacy Policy", "de": "Datenschutz"},
    }
    title = titles[doc_type].get(lang, titles[doc_type]["sv"])

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 12pt; color: #333; max-width: 800px; margin: 40px auto; padding: 0 40px; }}
  h1 {{ color: #1a5276; font-size: 18pt; border-bottom: 2px solid #1a5276; padding-bottom: 8px; margin-bottom: 20px; }}
  h2 {{ color: #2d6a8f; font-size: 14pt; }}
  p {{ line-height: 1.6; }}
  ul, ol {{ line-height: 1.8; }}
  .footer {{ margin-top: 40px; font-size: 10pt; color: #999; border-top: 1px solid #eee; padding-top: 10px; }}
</style>
</head>
<body>
<h1>{title}</h1>
{content_html}
<div class="footer">Sjölyckan, Rolsmo · {app_settings.ADMIN_EMAIL}</div>
</body>
</html>"""

    try:
        import weasyprint
        pdf = weasyprint.HTML(string=html).write_pdf()
        filename = f"sjolyckan_{doc_type}_{lang}.pdf"
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF-generering misslyckades: {str(e)}")


# ─── Kopiera säsong ──────────────────────────────────────
@router.post("/seasons/{season_id}/copy")
def copy_season(season_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import Season
    s = db.query(Season).filter(Season.id == season_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Säsong hittades inte")
    new_s = Season(
        name_sv=s.name_sv + " (kopia)",
        name_en=s.name_en + " (copy)" if s.name_en else "",
        name_de=s.name_de + " (Kopie)" if s.name_de else "",
        date_from=s.date_from,
        date_to=s.date_to,
        price_per_night=s.price_per_night,
        deposit_pct=s.deposit_pct,
        deposit_days=s.deposit_days,
        payment_days_before=s.payment_days_before,
        min_nights=s.min_nights,
        reminder_1_days=s.reminder_1_days,
        reminder_2_days=s.reminder_2_days,
        cancellation_deposit_days=s.cancellation_deposit_days,
        cancellation_full_days=s.cancellation_full_days,
        cancellation_refund_deposit=s.cancellation_refund_deposit,
        extra_guest_fee=s.extra_guest_fee,
        extra_guest_threshold=s.extra_guest_threshold,
        active=False,
    )
    db.add(new_s)
    db.commit()
    db.refresh(new_s)
    return new_s

@router.post("/mailersend-webhook")
async def mailersend_webhook(request: Request, db: Session = Depends(get_db)):
    """Tar emot bounce-notiser från MailerSend och markerar mejlloggen."""
    import hmac, hashlib, json as _json
    body = await request.body()

    # Verifiera signatur om webhook-hemlighet är konfigurerad
    secret = getattr(settings, "MAILERSEND_WEBHOOK_SECRET", None)
    if secret:
        sig = request.headers.get("Signature") or request.headers.get("X-MailerSend-Signature", "")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Ogiltig signatur")

    try:
        payload = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Ogiltig JSON")

    # v2: type på toppnivå, data.recipient.email
    event_type = payload.get("type", "")
    if event_type not in ("activity.hard_bounced", "activity.soft_bounced",
                          "activity.spam_complaint", "activity.unsubscribed"):
        return {"ok": True, "ignored": True}

    data = payload.get("data", {})
    # v2: data.recipient.email — fallback på v1: data["email"]
    recipient_obj = data.get("recipient") or data.get("email") or {}
    recipient_email = recipient_obj.get("email", "") if isinstance(recipient_obj, dict) else ""
    # v2 kan också ha recipient direkt som sträng
    if not recipient_email and isinstance(data.get("recipient"), str):
        recipient_email = data["recipient"]

    if not recipient_email:
        return {"ok": True}

    # Uppdatera email_logs: markera som studsad
    updated = db.query(EmailLog).filter(
        EmailLog.recipient == recipient_email,
        EmailLog.status == "sent",
    ).order_by(EmailLog.sent_at.desc()).limit(5).all()

    for log in updated:
        log.status = "bounced"
        log.error = f"{event_type} ({recipient_email})"

    # Ingen befintlig logg — bara logga till server (booking_id NOT NULL, kan ej skapa fri post)
    if not updated:
        import logging as _log
        _log.getLogger(__name__).warning(f"MailerSend bounce för okänd adress: {recipient_email} ({event_type})")

    db.commit()
    return {"ok": True, "event": event_type, "recipient": recipient_email, "updated": len(updated)}

@router.post("/brevo-webhook")
async def brevo_webhook(request: Request, db: Session = Depends(get_db)):
    """Tar emot bounce-notiser från Brevo och markerar mejlloggen."""
    import json as _json

    body = await request.body()
    try:
        payload = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Ogiltig JSON")

    # Brevo skickar antingen en array eller ett enskilt objekt
    events = payload if isinstance(payload, list) else [payload]

    BOUNCE_EVENTS = {
        "hard_bounce", "hard_bounced", "hardBounce",
        "soft_bounce", "soft_bounced", "softBounce",
        "complaint", "spam", "spam_complaint",
        "invalid", "invalid_email",
        "blocked",
    }

    processed = 0
    for event in events:
        event_type = event.get("event", "")
        if event_type not in BOUNCE_EVENTS:
            continue

        recipient_email = event.get("email", "")
        if not recipient_email:
            continue

        # Markera senaste skickade mejl till denna adress som studsad
        logs = db.query(EmailLog).filter(
            EmailLog.recipient == recipient_email,
            EmailLog.status == "sent",
        ).order_by(EmailLog.sent_at.desc()).limit(5).all()

        for log in logs:
            log.status = "bounced"
            log.error = f"brevo:{event_type}"

        if not logs:
            import logging as _log
            _log.getLogger(__name__).warning(f"Brevo bounce för okänd adress: {recipient_email} ({event_type})")
        processed += 1

    db.commit()
    return {"ok": True, "processed": processed}

# ─── Tilläggsbegäran (admin) ──────────────────────────────────────────────────
@router.get("/addon-requests")
def list_addon_requests(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import BookingAddon
    addons = db.query(BookingAddon).order_by(BookingAddon.created_at.desc()).all()
    result = []
    for a in addons:
        b = a.booking
        result.append({
            "id": a.id, "booking_ref": a.booking_ref, "status": a.status,
            "articles": a.articles, "total_amount": float(a.total_amount),
            "discount_amount": float(a.discount_amount or 0),
            "discount_pct": float((b.snapshot or {}).get("discount_pct") or 0) if b else 0,
            "message": a.message, "admin_note": a.admin_note,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "guest_name": b.guest_name if b else "", "guest_email": b.guest_email if b else "",
            "lang": b.lang if b else "sv",
        })
    return result


@router.post("/addon-requests/{addon_id}/confirm")
async def confirm_addon(addon_id: int, data: dict = {}, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Godkänn tilläggsbegäran — lägg till artiklar på bokningen och skicka betalningslänk."""
    from app.models.models import BookingAddon, BookingArticle
    from app.email.service import send_email
    from decimal import Decimal
    from datetime import datetime

    addon = db.query(BookingAddon).filter(BookingAddon.id == addon_id).first()
    if not addon: raise HTTPException(status_code=404, detail="Hittades inte")
    if addon.status != "pending": raise HTTPException(status_code=400, detail="Redan hanterad")

    booking = addon.booking
    addon.admin_note = data.get("admin_note", "")
    addon.status = "confirmed"

    # Lägg till artiklar på bokningen
    for art in addon.articles:
        ba = BookingArticle(
            booking_id=booking.id,
            article_id=art["article_id"],
            quantity=art["quantity"],
            price_snapshot=Decimal(str(art["price"])),
            line_total=Decimal(str(art["line_total"])),
            name_sv=art["name_sv"], name_en=art.get("name_en",""), name_de=art.get("name_de",""),
            price_type=art.get("price_type","fixed"),
        )
        db.add(ba)

    # Uppdatera bokningens totalbelopp
    booking.total_amount = (booking.total_amount or Decimal("0")) + Decimal(str(addon.total_amount))

    # Räkna om status: om bokningen redan var "Betald" innan tillägget kan den nu
    # vara "Delbetald" eftersom totalbeloppet ökat utan att motsvarande betalts.
    from app.core.booking_logic import recalc_booking_status
    recalc_booking_status(db, booking)

    db.commit()

    # Skicka bekräftelsemail till gäst med betalningslänk
    lang = booking.lang or "sv"
    pay_url = f"{settings.FRONTEND_URL}/pay/{booking.booking_ref}"
    rows = "".join(
        f"<tr><td>{a['name_' + lang] or a['name_sv']}</td><td>{a['quantity']} st</td><td>{a['line_total']:,.0f} kr</td></tr>"
        for a in addon.articles
    )
    subjects = {"sv":"Ditt tillägg är godkänt","en":"Your add-on is approved","de":"Ihr Zusatz wurde genehmigt"}
    intros = {
        "sv": f"Hej {booking.guest_name.split()[0]}! Ditt tilläggsval för bokning <strong>{booking.booking_ref}</strong> är godkänt.",
        "en": f"Hi {booking.guest_name.split()[0]}! Your add-on for booking <strong>{booking.booking_ref}</strong> has been approved.",
        "de": f"Hallo {booking.guest_name.split()[0]}! Ihr Zusatz für Buchung <strong>{booking.booking_ref}</strong> wurde genehmigt.",
    }
    pay_labels = {"sv":"Betala nu","en":"Pay now","de":"Jetzt bezahlen"}
    addon_discount_pct = float((booking.snapshot or {}).get("discount_pct") or 0)
    discount_row = (
        f"<tr><td colspan=\"2\" style=\"color:#27ae60\">Rabatt ({addon_discount_pct:.0f}%)</td><td style=\"color:#27ae60\">−{float(addon.discount_amount):,.0f} kr</td></tr>"
        if addon.discount_amount and float(addon.discount_amount) > 0 else ""
    )
    html = f"""<h2>{subjects[lang]}</h2>
    <p>{intros[lang]}</p>
    <table border="1" cellpadding="6">
    <tr><th>Tillägg</th><th>Antal</th><th>Belopp</th></tr>
    {rows}
    {discount_row}
    <tr><td colspan="2"><strong>Totalt</strong></td><td><strong>{float(addon.total_amount):,.0f} kr</strong></td></tr>
    </table>
    {"<p><em>" + (addon.admin_note or "") + "</em></p>" if addon.admin_note else ""}
    <p><a href="{pay_url}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">{pay_labels[lang]} →</a></p>"""

    recipient = (booking.user.email if booking.user_id and booking.user else None) or booking.guest_email
    await send_email(recipient, subjects[lang], html)
    return {"ok": True}


@router.post("/addon-requests/{addon_id}/reject")
async def reject_addon(addon_id: int, data: dict = {}, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import BookingAddon
    from app.email.service import send_email

    addon = db.query(BookingAddon).filter(BookingAddon.id == addon_id).first()
    if not addon: raise HTTPException(status_code=404, detail="Hittades inte")
    if addon.status != "pending": raise HTTPException(status_code=400, detail="Redan hanterad")

    addon.status = "rejected"
    addon.admin_note = data.get("admin_note", "")
    db.commit()

    booking = addon.booking
    lang = booking.lang or "sv"
    subjects = {"sv":"Angående ditt tilläggsval","en":"Regarding your add-on request","de":"Bezüglich Ihrer Zusatzanfrage"}
    intros = {
        "sv": f"Hej {booking.guest_name.split()[0]}! Tyvärr kan vi inte bekräfta ditt tilläggsval för bokning <strong>{booking.booking_ref}</strong> just nu.",
        "en": f"Hi {booking.guest_name.split()[0]}! Unfortunately we cannot confirm your add-on for booking <strong>{booking.booking_ref}</strong> at this time.",
        "de": f"Hallo {booking.guest_name.split()[0]}! Leider können wir Ihren Zusatz für Buchung <strong>{booking.booking_ref}</strong> derzeit nicht bestätigen.",
    }
    html = f"""<h2>{subjects[lang]}</h2>
    <p>{intros[lang]}</p>
    {"<p><em>" + (addon.admin_note or "") + "</em></p>" if addon.admin_note else ""}
    <p>Kontakta oss om du har frågor.</p>"""

    recipient = (booking.user.email if booking.user_id and booking.user else None) or booking.guest_email
    await send_email(recipient, subjects[lang], html)
    return {"ok": True}


@router.get("/bookings/{booking_id}/addon-requests")
def get_booking_addons(booking_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import BookingAddon
    addons = db.query(BookingAddon).filter(BookingAddon.booking_id == booking_id).order_by(BookingAddon.created_at.desc()).all()
    disc_pct = 0
    if addons and addons[0].booking:
        disc_pct = float((addons[0].booking.snapshot or {}).get("discount_pct") or 0)
    return [{"id":a.id,"status":a.status,"articles":a.articles,"total_amount":float(a.total_amount),"discount_amount":float(a.discount_amount or 0),"discount_pct":disc_pct,"message":a.message,"admin_note":a.admin_note,"created_at":a.created_at.isoformat() if a.created_at else None} for a in addons]
