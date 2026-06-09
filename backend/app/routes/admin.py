from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from app.models.database import get_db
from app.models.models import Season, Article, PriceOverride, Setting, User, EmailLog, Booking
from app.core.auth import require_admin
from app.core.config import settings

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
    is_deposit: bool = False
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
    return [{"id": b.id, "date_from": str(b.date_from), "date_to": str(b.date_to), "reason": b.reason} for b in blocks]

@router.post("/blocked-dates")
def create_blocked_date(
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import BlockedDate
    from datetime import date
    b = BlockedDate(
        date_from=date.fromisoformat(data["date_from"]),
        date_to=date.fromisoformat(data["date_to"]),
        reason=data.get("reason", ""),
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return {"id": b.id, "date_from": str(b.date_from), "date_to": str(b.date_to), "reason": b.reason}

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

    to_admin = log.recipient != booking.guest_email
    ok = await send_booking_email(db, booking, log.email_type, to_admin=to_admin)
    if ok:
        from datetime import datetime
        log.status = "sent"
        log.error = None
        log.sent_at = datetime.utcnow()
        db.commit()
        return {"status": "sent"}
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

    # Lägg till ett nytt failed-logginlägg om inget hittas
    if not updated:
        db.add(EmailLog(
            booking_id=None,
            email_type="bounce",
            recipient=recipient_email,
            status="bounced",
            error=event_type,
        ))

    db.commit()
    return {"ok": True, "event": event_type, "recipient": recipient_email}

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

    BOUNCE_EVENTS = {"hard_bounce", "soft_bounce", "spam", "invalid_email", "blocked"}

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
            db.add(EmailLog(
                booking_id=None,
                email_type="bounce",
                recipient=recipient_email,
                status="bounced",
                error=f"brevo:{event_type}",
            ))
        processed += 1

    db.commit()
    return {"ok": True, "processed": processed}
