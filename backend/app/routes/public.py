from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from datetime import date, timedelta
from app.models.database import get_db
from app.models.models import Season, Article, Booking, BookingStatus, PriceOverride
from app.core.booking_logic import get_price_for_date

router = APIRouter(prefix="/api/public", tags=["public"])


@router.post("/client-error")
async def report_client_error(request: Request, db: Session = Depends(get_db)):
    """Tar emot felrapporter från gästens webbläsare på bokningssidorna, så
    admin kan felsöka problem gästen inte kan beskriva själv. Görs medvetet
    tolerant (fångar allt, misslyckas aldrig högljutt) eftersom felrapportering
    aldrig får krascha eller störa gästens upplevelse."""
    from app.models.models import ClientErrorLog
    try:
        data = await request.json()
    except Exception:
        return {"ok": False}
    try:
        log = ClientErrorLog(
            context=str(data.get("context") or "")[:100] or None,
            message=str(data.get("message") or "")[:4000] or None,
            stack=str(data.get("stack") or "")[:4000] or None,
            url=str(data.get("url") or "")[:500] or None,
            user_agent=str(data.get("user_agent") or "")[:500] or None,
            lang=str(data.get("lang") or "")[:5] or None,
            guest_email=str(data.get("guest_email") or "")[:255] or None,
            extra=data.get("extra") if isinstance(data.get("extra"), dict) else None,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True}



@router.get("/articles")
def public_articles(lang: str = "sv", db: Session = Depends(get_db)):
    """Returnerar synliga och bokningsbara tillägg för gäster."""
    articles = db.query(Article).filter(
        Article.active == True,
        Article.visible == True,
        Article.is_deposit == False,
    ).order_by(Article.sort_order, Article.id).all()

    result = []
    for a in articles:
        name = getattr(a, f"name_{lang}", a.name_sv)
        desc = getattr(a, f"desc_{lang}", a.desc_sv)
        result.append({
            "id": a.id,
            "name": name,
            "desc": desc,
            "price": float(a.price),
            "price_type": a.price_type,
            "icon": a.icon,
            "bookable": a.bookable,
            "is_pet_fee": a.is_pet_fee,
        })
    return result


@router.get("/availability")
def public_availability(
    year: int = None,
    month: int = None,
    db: Session = Depends(get_db),
):
    """
    Returnerar tillgänglighet och priser för en månad.
    Används av kalenderkomponenten på bokningssidan.
    """
    today = date.today()
    if not year:
        year = today.year
    if not month:
        month = today.month

    # Beräkna alla dagar i månaden
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)

    # Hämta bekräftade bokningar som överlappar månaden
    booked_dates = set()
    pending_dates = set()
    # Hämta blockerade datum
    from app.models.models import BlockedDate
    blocked = db.query(BlockedDate).filter(
        BlockedDate.date_from < end,
        BlockedDate.date_to > start,
    ).all()
    for b in blocked:
        d = b.date_from
        while d < b.date_to:
            booked_dates.add(d)
            d += timedelta(days=1)
    bookings = db.query(Booking).filter(
        Booking.status.in_([
            BookingStatus.confirmed,
            BookingStatus.deposit_paid,
            BookingStatus.paid,
        ]),
        Booking.date_from < end,
        Booking.date_to > start,
    ).all()

    for b in bookings:
        d = b.date_from
        while d < b.date_to:
            booked_dates.add(d)
            d += timedelta(days=1)

    # Preliminära: väntar på godkännande ELLER på kundens e-postbekräftelse.
    # Båda blockerar nya bokningar (se kollisionskoll), så de ska inte visas som lediga.
    pending_bookings = db.query(Booking).filter(
        Booking.status.in_([
            BookingStatus.pending,
            BookingStatus.pending_email_verify,
        ]),
        Booking.date_from < end,
        Booking.date_to > start,
    ).all()
    for b in pending_bookings:
        d = b.date_from
        while d < b.date_to:
            if d not in booked_dates:
                pending_dates.add(d)
            d += timedelta(days=1)

    # Bygg kalenderdata
    days = []
    d = start
    while d < end:
        price, season = get_price_for_date(db, d)
        days.append({
            "date": str(d),
            "available": d not in booked_dates and d >= today,
            "status": "pending" if d in pending_dates else "booked" if d in booked_dates else "past" if d < today else "available",
            "price": float(price) if price else None,
            "season": season.name_sv if season else None,
            "past": d < today,
        })
        d += timedelta(days=1)

    return {"year": year, "month": month, "days": days}


@router.get("/seasons")
def public_seasons(lang: str = "sv", db: Session = Depends(get_db)):
    """Returnerar aktiva och synliga säsonger för gäster."""
    seasons = db.query(Season).filter(
        Season.active == True,
        Season.visible == True,
    ).order_by(Season.date_from).all()

    return [
        {
            "name": getattr(s, f"name_{lang}", s.name_sv),
            "date_from": str(s.date_from),
            "date_to": str(s.date_to),
            "price_per_night": float(s.price_per_night),
            "min_nights": s.min_nights,
            "deposit_pct": float(s.deposit_pct),
        }
        for s in seasons
    ]


@router.get("/terms")
def get_terms(
    lang: str = "sv",
    deposit_pct: float = 10,
    deposit_days: int = 7,
    payment_days_before: int = 60,
    date_from: str = None,
    max_guests: int = None,
    db: Session = Depends(get_db)
):
    from app.models.cms_models import ContentBlock
    from app.core.config import settings as app_settings
    from app.models.models import Season
    from datetime import date as date_type
    from jinja2 import Environment
    terms = db.query(ContentBlock).filter(ContentBlock.key == "terms_text").first()
    gdpr  = db.query(ContentBlock).filter(ContentBlock.key == "gdpr_text").first()
    lang_map = {"sv": "value_sv", "en": "value_en", "de": "value_de"}
    field = lang_map.get(lang, "value_sv")
    # Slå upp rätt säsong baserat på datum
    season = None
    if date_from:
        try:
            d = date_type.fromisoformat(date_from)
            season = db.query(Season).filter(
                Season.active == True,
                Season.date_from <= d,
                Season.date_to >= d,
            ).first()
        except Exception:
            pass
    if not season:
        season = db.query(Season).filter(Season.active == True).first()
    # Hämta max_guests från inställningar
    from app.models.models import Setting
    if max_guests is None:
        max_guests_setting = db.query(Setting).filter(Setting.key == "max_guests").first()
        max_guests = int(max_guests_setting.value) if max_guests_setting else 8

    ctx = {
        "snap": {
            "deposit_pct": float(season.deposit_pct) if season else deposit_pct,
            "deposit_days": season.deposit_days if season else deposit_days,
            "payment_days_before": season.payment_days_before if season else payment_days_before,
            "cancellation_deposit_days": season.cancellation_deposit_days if season else 120,
            "cancellation_full_days": season.cancellation_full_days if season else 60,
        },
        "admin_email": app_settings.ADMIN_EMAIL,
        "max_guests": max_guests,
    }
    def render(text):
        if not text:
            return ""
        try:
            # Ersätt &nbsp; med vanliga mellanslag för Jinja2-rendering
            import re
            clean = text.replace('&nbsp;', ' ')
            # Rendera Jinja2
            rendered = Environment().from_string(clean).render(**ctx)
            # Återställ &nbsp; i icke-Jinja2-delar
            return rendered
        except Exception:
            return text
    house_rules = db.query(ContentBlock).filter(ContentBlock.key == "house_rules_text").first()

    return {
        "terms_text":       render(getattr(terms,       field, "") if terms       else ""),
        "gdpr_text":        render(getattr(gdpr,        field, "") if gdpr        else ""),
        "house_rules_text": render(getattr(house_rules, field, "") if house_rules else ""),
        "admin_email": app_settings.ADMIN_EMAIL,
    }

@router.get("/booking-lookup")
def booking_lookup(ref: str, db: Session = Depends(get_db)):
    """Kund anger bokningsnummer för att starta tilläggsbegäran."""
    from app.models.models import Booking, BookingStatus
    b = db.query(Booking).filter(Booking.booking_ref == ref.strip().upper()).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    if b.status not in (
        BookingStatus.confirmed, BookingStatus.deposit_paid,
        BookingStatus.partially_paid, BookingStatus.paid,
    ):
        raise HTTPException(status_code=400, detail="Bokningen är inte bekräftad")
    return {
        "booking_ref": b.booking_ref,
        "guest_name": b.guest_name,
        "date_from": str(b.date_from),
        "date_to": str(b.date_to),
        "nights": b.nights,
        "guests_count": b.guests_count,
        "lang": b.lang or "sv",
        "status": b.status.value,
        "discount_pct": float((b.snapshot or {}).get("discount_pct") or 0),
    }
