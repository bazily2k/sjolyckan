import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from app.models.database import get_db
from app.models.models import (
    Booking, BookingStatus, PaymentMethod, Payment,
    PaymentType, PaymentStatus, User, EmailLog,
    BookingCheckinCode, CheckinInfoItem
)
from app.core.booking_logic import calculate_booking_price, create_booking_record
from app.core.auth import get_current_user, require_admin
from app.email.service import send_booking_email, send_booking_email_by_id
import stripe
from app.core.config import settings

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY


# ─── Scheman ────────────────────────────────────────────
class BookingRequest(BaseModel):
    guest_name: str
    guest_email: EmailStr
    guest_phone: Optional[str] = None

    @validator('guest_phone')
    def validate_phone_format(cls, v):
        if v and not re.match(r'^\+[1-9]\d{6,14}$', v.strip()):
            raise ValueError('Telefonnummer måste anges med landskod, t.ex. +46701234567')
        return v
    guest_country: str = "SE"
    guest_address: Optional[str] = None
    lang: str = "sv"
    guests_count: int = 2
    adults_count: Optional[int] = None
    children_count: Optional[int] = None
    pets_count: Optional[int] = None
    date_from: date
    date_to: date
    article_ids: List[int] = []
    article_quantities: dict = {}
    message: Optional[str] = None
    terms_accepted: bool = False
    gdpr_accepted: bool = False
    house_rules_accepted: bool = False


class PriceCheckRequest(BaseModel):
    date_from: date
    date_to: date
    guests_count: int = 2
    article_ids: List[int] = []
    article_quantities: dict = {}
    guest_email: Optional[str] = None
    lang: str = "sv"


class AdminConfirmRequest(BaseModel):
    payment_method: PaymentMethod
    payment_methods: Optional[str] = None  # kommaseparerad: swish,paypal,stripe
    admin_note: Optional[str] = None
    deposit_due_date: Optional[date] = None   # åsidosätter beräknat datum
    payment_due_date: Optional[date] = None   # åsidosätter beräknat datum


class AdminPaymentRequest(BaseModel):
    payment_type: PaymentType
    amount: float
    reference: Optional[str] = None
    note: Optional[str] = None


# ─── Publik: Priskalkyl ─────────────────────────────────


# ─── Admin: Justera pris innan godkännande ──────────────
class AdminAdjustRequest(BaseModel):
    discount_amount: Optional[float] = 0
    remove_article_ids: Optional[list[int]] = []
    admin_note: Optional[str] = None

@router.patch("/admin/{booking_id}/adjust")
def admin_adjust_booking(
    booking_id: int,
    req: AdminAdjustRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from decimal import Decimal
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    if b.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Kan bara justera väntande bokningar")

    # Ta bort valda tillägg
    if req.remove_article_ids:
        from app.models.models import BookingArticle
        for aid in req.remove_article_ids:
            ba = db.query(BookingArticle).filter(
                BookingArticle.booking_id == b.id,
                BookingArticle.article_id == aid,
            ).first()
            if ba:
                db.delete(ba)
        db.flush()

    # Räkna om articles_amount från kvarvarande tillägg
    from app.models.models import BookingArticle
    remaining = db.query(BookingArticle).filter(BookingArticle.booking_id == b.id).all()
    articles_amount = sum(Decimal(str(a.line_total)) for a in remaining)

    # Ny total
    discount = Decimal(str(req.discount_amount or 0))
    new_total = b.base_amount + articles_amount - discount
    if new_total < 0:
        raise HTTPException(status_code=400, detail="Rabatten kan inte överstiga totalt belopp")

    # Ny handpenning (samma procentsats som i snapshot)
    deposit_pct = Decimal(str(b.snapshot.get("deposit_pct", 10)))
    new_deposit = (new_total * deposit_pct / 100).quantize(Decimal("1"))

    # Uppdatera bokning
    b.articles_amount = articles_amount
    b.total_amount = new_total
    b.deposit_amount = new_deposit
    if req.admin_note:
        b.admin_note = req.admin_note

    # Uppdatera snapshot (bevara desc/is_deposit/quantity från ursprunget)
    snap = dict(b.snapshot)
    _old_by_id = {x.get("article_id"): x for x in (snap.get("articles") or [])}
    snap["articles"] = [
        {
            "article_id": a.article_id,
            "name_sv": a.name_sv,
            "name_en": a.name_en,
            "name_de": a.name_de,
            "desc_sv": _old_by_id.get(a.article_id, {}).get("desc_sv", ""),
            "desc_en": _old_by_id.get(a.article_id, {}).get("desc_en", ""),
            "desc_de": _old_by_id.get(a.article_id, {}).get("desc_de", ""),
            "price": float(a.price_snapshot),
            "price_type": a.price_type,
            "quantity": getattr(a, "quantity", 1),
            "line_total": float(a.line_total),
            "is_deposit": _old_by_id.get(a.article_id, {}).get("is_deposit", False),
        }
        for a in remaining
    ]
    snap["discount_amount"] = float(discount)
    b.snapshot = snap

    db.commit()
    db.refresh(b)

    return {
        "total_amount": float(b.total_amount),
        "deposit_amount": float(b.deposit_amount),
        "articles_amount": float(b.articles_amount),
        "discount_amount": float(discount),
    }

@router.post("/price-check")
def price_check(req: PriceCheckRequest, db: Session = Depends(get_db)):
    try:
        # Hämta användarens rabatt om e-post finns i systemet
        discount_pct = Decimal('0')
        if hasattr(req, 'guest_email') and req.guest_email:
            user = db.query(User).filter(User.email == req.guest_email).first()
            if user and user.discount_pct:
                discount_pct = Decimal(str(user.discount_pct))
        
        calc = calculate_booking_price(
            db, req.date_from, req.date_to,
            req.guests_count, req.article_ids,
            discount_pct=discount_pct,
            article_quantities=req.article_quantities,
            lang=req.lang,
        )
        return {
            "nights": calc["nights"],
            "base_amount": float(calc["base_amount"]),
            "articles_amount": float(calc["articles_amount"]),
            "refundable_deposit_amount": float(calc["refundable_deposit_amount"]),
            "articles": calc["snapshot"]["articles"],
            "total_amount": float(calc["total_amount"]),
            "discount_amount": float(calc["discount_amount"]),
            "discount_pct": float(calc["snapshot"]["discount_pct"]),
            "extra_guest_fee": float(calc["extra_guest_fee"]) if calc.get("extra_guest_fee") else 0,
            "extra_guest_threshold": calc.get("extra_guest_threshold", 4),
            "extra_guests": calc.get("extra_guests", 0),
            "extra_guest_rate": float(calc.get("extra_guest_rate") or 0),
            "deposit_amount": float(calc["deposit_amount"]),
            "deposit_pct": calc["snapshot"]["deposit_pct"],
            "deposit_days": calc["snapshot"]["deposit_days"],
            "payment_days_before": calc["snapshot"]["payment_days_before"],
            "deposit_due_date": str(calc["deposit_due_date"]),
            "payment_due_date": str(calc["payment_due_date"]),
            "daily_prices": calc["snapshot"]["daily_prices"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Publik: Skicka bokningsförfrågan ───────────────────
@router.post("/request")
async def create_booking_request(
    req: BookingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    _lang = req.lang if req.lang in ("en", "de") else "sv"
    _consent = {
        "terms": {
            "sv": "Du måste godkänna bokningsvillkoren",
            "en": "You must accept the booking terms",
            "de": "Sie müssen die Buchungsbedingungen akzeptieren",
        },
        "gdpr": {
            "sv": "Du måste godkänna hanteringen av personuppgifter",
            "en": "You must accept the processing of personal data",
            "de": "Sie müssen der Verarbeitung personenbezogener Daten zustimmen",
        },
        "house_rules": {
            "sv": "Du måste godkänna husreglerna",
            "en": "You must accept the house rules",
            "de": "Sie müssen die Hausordnung akzeptieren",
        },
    }
    if not req.terms_accepted:
        raise HTTPException(status_code=400, detail=_consent["terms"][_lang])
    if not req.gdpr_accepted:
        raise HTTPException(status_code=400, detail=_consent["gdpr"][_lang])
    if not req.house_rules_accepted:
        raise HTTPException(status_code=400, detail=_consent["house_rules"][_lang])
    # Tillgänglighetskoll: avvisa datum som krockar med befintlig bokning (ej
    # cancelled) eller blockerat datum. Halvöppet intervall => utcheckningsdag ledig.
    from app.models.models import BlockedDate
    _unavail = {
        "en": "The selected dates are no longer available",
        "de": "Die gewählten Daten sind nicht mehr verfügbar",
    }.get(req.lang, "De valda datumen är inte längre tillgängliga")
    conflict = db.query(Booking).filter(
        Booking.status != BookingStatus.cancelled,
        Booking.date_from < req.date_to,
        Booking.date_to > req.date_from,
    ).first()
    if conflict:
        raise HTTPException(status_code=409, detail=_unavail)
    blocked = db.query(BlockedDate).filter(
        BlockedDate.date_from < req.date_to,
        BlockedDate.date_to > req.date_from,
    ).first()
    if blocked:
        raise HTTPException(status_code=409, detail=_unavail)
    try:
        discount_pct = Decimal('0')
        if req.guest_email:
            user = db.query(User).filter(User.email == req.guest_email).first()
            if user and user.discount_pct:
                discount_pct = Decimal(str(user.discount_pct))
        calc = calculate_booking_price(
            db, req.date_from, req.date_to,
            req.guests_count, req.article_ids,
            discount_pct=discount_pct,
            article_quantities=req.article_quantities,
            lang=req.lang,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Hämta och rendera villkorstexter för snapshot
    try:
        from app.models.cms_models import ContentBlock
        from jinja2 import Environment
        from app.core.config import settings as app_settings
        snap = calc["snapshot"]
        ctx = {
            "snap": snap,
            "admin_email": app_settings.ADMIN_EMAIL,
            "max_guests": req.guests_count,
        }
        def render_block(key, lang):
            block = db.query(ContentBlock).filter(ContentBlock.key == key).first()
            if not block:
                return ""
            field = {"sv": "value_sv", "en": "value_en", "de": "value_de"}.get(lang, "value_sv")
            raw = getattr(block, field, "") or ""
            try:
                return Environment().from_string(raw.replace("&nbsp;", " ")).render(**ctx)
            except Exception:
                return raw
        lang = req.lang or "sv"
        terms_snapshot = {
            "terms_text":       render_block("terms_text", lang),
            "gdpr_text":        render_block("gdpr_text", lang),
            "house_rules_text": render_block("house_rules_text", lang),
            "lang": lang,
            "rendered_at": str(calc["deposit_due_date"]),
        }
    except Exception as e:
        terms_snapshot = None
    req_dict = req.dict()
    req_dict["terms_snapshot"] = terms_snapshot
    try:
        booking = create_booking_record(db, req_dict, calc)
    except IntegrityError:
        # Databasens exclusion constraint fångade en samtidig dubbelbokning
        db.rollback()
        raise HTTPException(status_code=409, detail=_unavail)

    # Koppla bokningen till ett kundkonto (skapa automatiskt vid behov) — alternativ B
    try:
        from app.core.auth import hash_password
        from app.email.service import send_simple_email
        from app.models.models import UserRole
        import secrets as _secrets
        from datetime import datetime as _dt, timedelta as _td

        email_norm = (req.guest_email or "").strip().lower()

        # Tolka adressfälten (line1, line2, postnr, ort)
        line1 = line2 = postal = city = None
        if req.guest_address:
            parts = [p.strip() for p in req.guest_address.split(",")]
            if len(parts) >= 3:
                line1, line2 = parts[0], parts[1]
            elif len(parts) == 2:
                line1 = parts[0]
            last = parts[-1].strip().split(" ", 1) if parts else []
            if len(last) == 2:
                postal, city = last[0], last[1]

        name = (req.guest_name or "").strip()
        first_name = name.split(" ")[0] if name else ""
        last_name = name.split(" ", 1)[1] if " " in name else ""

        user = (db.query(User).filter(User.email == email_norm).first()
                or db.query(User).filter(User.email == req.guest_email).first())

        new_account = False
        if user:
            # Befintligt konto: uppdatera profil (oförändrat beteende)
            if req.guest_phone:
                user.phone = req.guest_phone
            if req.guest_country:
                user.country = req.guest_country
            if line1 is not None:
                user.address_line1 = line1
                user.address_line2 = line2
            if postal:
                user.postal_code = postal
            if city:
                user.city = city
            if first_name and not user.first_name:
                user.first_name = first_name
            if last_name and not user.last_name:
                user.last_name = last_name
        else:
            # Nytt konto: oanvändbart slumplösenord tills kunden sätter sitt eget
            user = User(
                email=email_norm,
                password_hash=hash_password(_secrets.token_urlsafe(32)),
                first_name=first_name or None,
                last_name=last_name or None,
                phone=req.guest_phone or None,
                country=req.guest_country or "SE",
                address_line1=line1,
                address_line2=line2,
                postal_code=postal,
                city=city,
                role=UserRole.guest,
                is_active=True,
                password_set_by_user=False,
            )
            db.add(user)
            db.flush()  # ger user.id
            new_account = True

        booking.user_id = user.id

        set_pw_token = None
        if new_account:
            set_pw_token = _secrets.token_urlsafe(32)
            user.reset_token = set_pw_token
            user.reset_token_expires = _dt.utcnow() + _td(days=7)

        db.commit()

        # Skicka "sätt lösenord"-mejl till nyskapat konto
        if new_account and set_pw_token:
            _lang2 = req.lang if req.lang in ("en", "de") else "sv"
            _pfx2 = "" if _lang2 == "sv" else f"/{_lang2}"
            set_url = f"{settings.FRONTEND_URL}{_pfx2}/reset-password/{set_pw_token}?welcome=1"
            subj = {
                "sv": "Ditt konto hos Sjölyckan — sätt ditt lösenord",
                "en": "Your Sjölyckan account — set your password",
                "de": "Ihr Sjölyckan-Konto — Passwort festlegen",
            }[_lang2]
            greet = {"sv": f"Hej {first_name or ''}", "en": f"Hello {first_name or ''}", "de": f"Hallo {first_name or ''}"}[_lang2]
            body = {
                "sv": "I samband med din bokningsförfrågan har vi skapat ett konto åt dig. Klicka på länken nedan för att sätta ditt lösenord och logga in för att följa din bokning. Länken är giltig i 7 dagar.",
                "en": "Together with your booking request we have created an account for you. Click the link below to set your password and log in to follow your booking. The link is valid for 7 days.",
                "de": "Zusammen mit Ihrer Buchungsanfrage haben wir ein Konto für Sie erstellt. Klicken Sie auf den Link unten, um Ihr Passwort festzulegen und sich anzumelden, um Ihre Buchung zu verfolgen. Der Link ist 7 Tage gültig.",
            }[_lang2]
            background_tasks.add_task(
                send_simple_email, db,
                to_email=email_norm,
                subject=subj,
                html=f"""<p>{greet},</p>
<p>{body}</p>
<p><a href="{set_url}">{set_url}</a></p>
<p>Sjölyckan, Rolsmo</p>""",
            )
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Kontokoppling misslyckades: {e}")


    # Skicka mejl till gäst och admin.
    # Hoppa över e-postverifiering om kundens konto redan är verifierat (en gång räcker).
    _email = (req.guest_email or "").strip().lower()
    _existing = db.query(User).filter(User.email == _email).first() if _email else None
    if _existing and _existing.email_verified:
        booking.status = BookingStatus.pending
        db.commit()
        background_tasks.add_task(send_booking_email_by_id, booking.id, "booking_request")
        background_tasks.add_task(send_booking_email_by_id, booking.id, "admin_new_booking", True)
    else:
        token = secrets.token_urlsafe(32)
        booking.email_verify_token = token
        booking.email_verify_expires = datetime.now(timezone.utc) + timedelta(hours=48)
        booking.status = BookingStatus.pending_email_verify
        db.commit()
        background_tasks.add_task(_send_email_verify, booking.id)
        background_tasks.add_task(_send_admin_pending_verify, booking.id)

    return {
        "booking_ref": booking.booking_ref,
        "status": booking.status.value,
        "total_amount": float(booking.total_amount),
        "deposit_amount": float(booking.deposit_amount),
        "deposit_due_date": str(booking.deposit_due_date),
        "payment_due_date": str(booking.payment_due_date),
    }


# ─── Admin: Lista alla bokningar ────────────────────────
@router.get("/admin/list")
def admin_list_bookings(
    status: Optional[str] = None,
    show_hidden: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(Booking)
    if not show_hidden:
        q = q.filter(Booking.hidden == False)
    if status:
        q = q.filter(Booking.status == status)
    total = q.count()
    bookings = q.order_by(Booking.created_at.desc()).offset(skip).limit(limit).all()
    return {
        'items': [_booking_summary(b) for b in bookings],
        'total': total,
        'skip': skip,
        'limit': limit,
    }


# ─── Admin/Personal: Kalender ───────────────────────────
@router.get("/admin/calendar")
def admin_calendar(
    start: Optional[str] = None,
    end: Optional[str] = None,
    show_hidden: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Kalenderdata för admin och personal: bokningar som överlappar [start, end).

    Standardintervall: innevarande månad t.o.m. sista aktiva säsongens slut
    (dock alltid minst 12 månader, och alltid så långt att bokningar/blockeringar syns).
    Avbokade bokningar exkluderas alltid; dolda exkluderas om inte show_hidden.
    """
    from app.models.models import Season, BlockedDate
    today = date.today()
    try:
        start_d = date.fromisoformat(start) if start else today.replace(day=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ogiltigt startdatum")
    if end:
        try:
            end_d = date.fromisoformat(end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ogiltigt slutdatum")
    else:
        # Följ säsongerna: sista aktiva säsongens slutdatum sätter horisonten.
        horizon = db.query(func.max(Season.date_to)).filter(Season.active == True).scalar()
        # Låt aldrig bokningar eller blockeringar hamna utanför vyn.
        last_booking = db.query(func.max(Booking.date_to)).filter(
            Booking.status != BookingStatus.cancelled
        ).scalar()
        last_block = db.query(func.max(BlockedDate.date_to)).scalar()
        # Minst 12 månader framåt även om inga säsonger är inlagda.
        min_horizon = date(start_d.year + (start_d.month - 1 + 12) // 12,
                           (start_d.month - 1 + 12) % 12 + 1, 1)
        horizon = max([d for d in (horizon, last_booking, last_block, min_horizon) if d])
        # Runda upp till början av månaden efter horisonten (end är exklusiv).
        y = horizon.year + (horizon.month // 12)
        m = horizon.month % 12 + 1
        end_d = date(y, m, 1)


    q = db.query(Booking).filter(
        Booking.status != BookingStatus.cancelled,
        Booking.date_from < end_d,
        Booking.date_to > start_d,
    )
    if not show_hidden:
        q = q.filter(Booking.hidden == False)
    bookings = q.order_by(Booking.date_from).all()

    def _cal(b: Booking) -> dict:
        return {
            "id": b.id,
            "booking_ref": b.booking_ref,
            "status": b.status.value,
            "guest_name": b.guest_name,
            "guest_email": b.guest_email,
            "guest_phone": b.guest_phone,
            "guest_country": b.guest_country,
            "date_from": str(b.date_from),
            "date_to": str(b.date_to),
            "nights": b.nights,
            "guests_count": b.guests_count,
            "adults_count": b.adults_count,
            "children_count": b.children_count,
            "pets_count": b.pets_count,
            "message": b.message,
            "admin_note": b.admin_note,
            "total_amount": float(b.total_amount),
            "articles": [
                {
                    "name_sv": a.name_sv,
                    "name_en": a.name_en,
                    "name_de": a.name_de,
                    "quantity": a.quantity,
                    "line_total": float(a.line_total) if a.line_total is not None else 0.0,
                } for a in b.articles
            ],
            "addons": [
                {
                    "id": ad.id,
                    "status": ad.status,
                    "articles": ad.articles,
                    "total_amount": float(ad.total_amount),
                    "message": ad.message,
                } for ad in b.addons
            ],
        }

    from app.models.models import BlockedDate
    blocks = db.query(BlockedDate).filter(
        BlockedDate.date_from < end_d,
        BlockedDate.date_to > start_d,
    ).order_by(BlockedDate.date_from).all()

    return {
        "start": str(start_d),
        "end": str(end_d),
        "bookings": [_cal(b) for b in bookings],
        "blocked": [
            {"id": bl.id, "date_from": str(bl.date_from), "date_to": str(bl.date_to), "reason": bl.reason}
            for bl in blocks
        ],
    }


def _get_booking_codes(booking_id: int):
    """Returnerar sparade kodvärden för en bokning (från egen tabell)."""
    from app.models.database import SessionLocal
    db = SessionLocal()
    try:
        rows = db.query(BookingCheckinCode).filter(BookingCheckinCode.booking_id == booking_id).all()
        return [{"item_id": r.item_id, "value": r.value} for r in rows]
    finally:
        db.close()


class CheckinCodesRequest(BaseModel):
    codes: dict = {}                 # {item_id: värde}
    checkin_send_date: Optional[date] = None


@router.patch("/admin/{booking_id}/checkin")
def admin_set_checkin(
    booking_id: int,
    req: CheckinCodesRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Spara kodvärden per bokning samt (valfritt) utskicksdatum för incheckningsmailet."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    b.checkin_send_date = req.checkin_send_date
    # Ersätt befintliga koder för denna bokning
    db.query(BookingCheckinCode).filter(BookingCheckinCode.booking_id == booking_id).delete()
    for item_id, value in (req.codes or {}).items():
        if value and str(value).strip():
            db.add(BookingCheckinCode(booking_id=booking_id, item_id=int(item_id), value=str(value).strip()))
    db.commit()
    return {"ok": True, "checkin_send_date": str(b.checkin_send_date) if b.checkin_send_date else None}


# ─── Admin: Hämta enskild bokning ───────────────────────
@router.get("/admin/{booking_id}")
def admin_get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    return _booking_detail(b)


# ─── Admin: Godkänn bokning ─────────────────────────────
@router.post("/admin/{booking_id}/confirm")
async def admin_confirm_booking(
    booking_id: int,
    req: AdminConfirmRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    if b.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Bokningen är inte i väntande status")

    from datetime import datetime
    b.status = BookingStatus.confirmed
    b.payment_method = req.payment_method
    b.payment_methods = req.payment_methods or req.payment_method.value
    b.admin_note = req.admin_note
    b.confirmed_at = datetime.utcnow()

    # Admin kan justera förfallodatum vid godkännande
    if req.payment_due_date:
        b.payment_due_date = req.payment_due_date

    has_deposit = b.deposit_amount and b.deposit_amount > 0
    if has_deposit:
        if req.deposit_due_date:
            b.deposit_due_date = req.deposit_due_date
    else:
        # Ingen handpenning — inget förfallodatum ska visas för kunden
        b.deposit_due_date = None

    # Skapa betalningsposter (handpenning bara om beloppet är > 0)
    deposit = None
    if has_deposit:
        deposit = Payment(
            booking_id=b.id,
            type=PaymentType.deposit,
            method=req.payment_method,
            amount=b.deposit_amount,
            status=PaymentStatus.pending,
            due_date=b.deposit_due_date,
        )
        db.add(deposit)
    final = Payment(
        booking_id=b.id,
        type=PaymentType.final,
        method=req.payment_method,
        amount=b.total_amount - (b.deposit_amount or 0),
        status=PaymentStatus.pending,
        due_date=b.payment_due_date,
    )
    db.add(final)
    db.commit()
    db.refresh(b)

    # Skicka bekräftelse till gäst
    background_tasks.add_task(send_booking_email_by_id, b.id, "booking_confirmed")

    # Om Stripe — skapa betalningslänk för handpenning
    if has_deposit and req.payment_method == PaymentMethod.stripe and settings.STRIPE_SECRET_KEY:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "sek",
                    "product_data": {"name": f"Handpenning – {b.booking_ref}"},
                    "unit_amount": int(b.deposit_amount * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{settings.FRONTEND_URL}/booking/success?ref={b.booking_ref}",
            cancel_url=f"{settings.FRONTEND_URL}/booking/cancel?ref={b.booking_ref}",
            metadata={"booking_ref": b.booking_ref, "payment_type": "deposit"},
        )
        deposit.stripe_session_id = session.id
        b.stripe_session_id = session.id
        db.commit()
        return {"status": "confirmed", "stripe_url": session.url}

    return {"status": "confirmed"}


# ─── Admin: Neka bokning ────────────────────────────────
@router.post("/admin/{booking_id}/reject")
async def admin_reject_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    b.status = BookingStatus.cancelled
    db.commit()
    background_tasks.add_task(send_booking_email_by_id, b.id, "booking_rejected")
    return {"status": "rejected"}


# ─── Admin: Registrera manuell betalning ────────────────
@router.post("/admin/{booking_id}/payment")
def admin_register_payment(
    booking_id: int,
    req: AdminPaymentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from datetime import datetime
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    payment = db.query(Payment).filter(
        Payment.booking_id == booking_id,
        Payment.type == req.payment_type,
    ).first()

    if payment:
        payment.status = PaymentStatus.paid
        payment.paid_at = datetime.utcnow()
        payment.reference = req.reference
        payment.note = req.note
    else:
        payment = Payment(
            booking_id=b.id,
            type=req.payment_type,
            method=b.payment_method,
            amount=req.amount,
            status=PaymentStatus.paid,
            paid_at=datetime.utcnow(),
            reference=req.reference,
            note=req.note,
        )
        db.add(payment)

    # Uppdatera bokningsstatus
    paid_payments = [p for p in b.payments if p.status == PaymentStatus.paid]
    total_paid = sum(float(p.amount) for p in paid_payments)

    if total_paid >= float(b.total_amount) - 1:
        b.status = BookingStatus.paid
    elif any(p.type == PaymentType.deposit for p in paid_payments):
        b.status = BookingStatus.deposit_paid

    db.commit()
    db.refresh(b)

    # Skicka mail vid handpenning — informera om slutbetalning
    from app.email.service import send_booking_email_by_id
    import asyncio
    if b.status == BookingStatus.deposit_paid:
        asyncio.create_task(send_booking_email_by_id(b.id, "payment_reminder"))

    return {"status": "payment_registered", "booking_status": b.status.value}


# ─── Hjälpfunktioner ────────────────────────────────────
def _booking_summary(b: Booking) -> dict:
    return {
        "id": b.id,
        "booking_ref": b.booking_ref,
        "guest_name": b.guest_name,
        "guest_email": b.guest_email,
        "message": b.message,
        "user_id": b.user_id,
        "user_email": b.user.email if b.user_id and b.user else None,
        "guest_country": b.guest_country,
        "date_from": str(b.date_from),
        "date_to": str(b.date_to),
        "nights": b.nights,
        "total_amount": float(b.total_amount),
        "deposit_amount": float(b.deposit_amount),
        "status": b.status.value,
        "payment_method": b.payment_method.value if b.payment_method else None,
        "payment_methods": b.payment_methods,
        "created_at": str(b.created_at),
        "payment_due_date": str(b.payment_due_date),
        "deposit_due_date": str(b.deposit_due_date),
        "hidden": b.hidden,
        "terms_accepted": b.terms_accepted,
        "gdpr_accepted": b.gdpr_accepted,
        "house_rules_accepted": b.house_rules_accepted,
        "terms_snapshot": b.terms_snapshot,
    }


def _booking_detail(b: Booking) -> dict:
    d = _booking_summary(b)
    d.update({
        "guest_phone": b.guest_phone,
        "guests_count": b.guests_count,
        "lang": b.lang,
        "base_amount": float(b.base_amount),
        "articles_amount": float(b.articles_amount),
        "admin_note": b.admin_note,
        "confirmed_at": str(b.confirmed_at) if b.confirmed_at else None,
        "checkin_send_date": str(b.checkin_send_date) if b.checkin_send_date else None,
        "checkin_codes": _get_booking_codes(b.id),
        "snapshot": b.snapshot,
        "articles": [
            {
                "article_id": a.article_id,
                "name_sv": a.name_sv,
                "name_en": a.name_en,
                "price_snapshot": float(a.price_snapshot),
                "price_type": a.price_type,
                "line_total": float(a.line_total),
            } for a in b.articles
        ],
        "payments": [
            {
                "type": p.type.value,
                "method": p.method.value,
                "amount": float(p.amount),
                "status": p.status.value,
                "due_date": str(p.due_date) if p.due_date else None,
                "paid_at": str(p.paid_at) if p.paid_at else None,
                "reference": p.reference,
            } for p in b.payments
        ],
        "email_logs": [
            {
                "type": e.email_type,
                "sent_at": str(e.sent_at),
                "status": e.status,
            } for e in b.email_logs
        ],
        "addons": [
            {
                "id": a.id,
                "status": a.status,
                "articles": a.articles,
                "total_amount": float(a.total_amount),
                "message": a.message,
                "admin_note": a.admin_note,
                "created_at": str(a.created_at) if a.created_at else None,
            } for a in (b.addons if hasattr(b, "addons") else [])
        ],
    })
    return d


# ─── Gästens egna bokningar ──────────────────────────────
@router.get("/my")
def my_bookings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bookings = db.query(Booking).filter(
        Booking.guest_email == user.email
    ).order_by(Booking.created_at.desc()).all()
    return [_booking_detail(b) for b in bookings]


# ─── Admin: Ändra status fritt ───────────────────────────
@router.patch("/admin/{booking_id}/status")
async def admin_change_status(
    booking_id: int,
    data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    new_status = data.get("status")
    valid = [s.value for s in BookingStatus]
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Ogiltig status. Välj: {valid}")
    prev_status = booking.status
    booking.status = BookingStatus(new_status)
    db.commit()
    # Skicka mail vid avbokning
    if new_status == "cancelled" and prev_status != BookingStatus.cancelled:
        background_tasks.add_task(send_booking_email_by_id, booking_id, "booking_cancelled")
    return {"ok": True, "status": new_status}


# ─── Admin: Radera bokning ───────────────────────────
@router.delete("/admin/{booking_id}")
def admin_delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    # Ta bort relaterade poster först
    from app.models.models import EmailLog, BookingArticle, Payment
    db.query(EmailLog).filter(EmailLog.booking_id == booking_id).delete()
    db.query(BookingArticle).filter(BookingArticle.booking_id == booking_id).delete()
    db.query(Payment).filter(Payment.booking_id == booking_id).delete()
    from app.models.models import BookingAddon
    db.query(BookingAddon).filter(BookingAddon.booking_id == booking_id).delete()
    db.delete(booking)
    db.commit()
    return {"ok": True}


# ─── Admin: Dölj/visa bokning ────────────────────────
@router.patch("/admin/{booking_id}/hide")
def admin_hide_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    booking.hidden = not booking.hidden
    db.commit()
    return {"ok": True, "hidden": booking.hidden}




# ─── Admin: Lägg till tillägg på bokning ────────────────
class AdminAddArticleRequest(BaseModel):
    article_id: int
    quantity: int = 1

@router.post("/admin/{booking_id}/add-article")
def admin_add_article(
    booking_id: int,
    req: AdminAddArticleRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from decimal import Decimal
    from app.models.models import Article, BookingArticle
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    art = db.query(Article).filter(Article.id == req.article_id, Article.active == True).first()
    if not art:
        raise HTTPException(status_code=404, detail="Tillägg hittades inte")

    # Kolla om redan tillagd
    existing = db.query(BookingArticle).filter(
        BookingArticle.booking_id == b.id,
        BookingArticle.article_id == req.article_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tillägget finns redan på bokningen")

    # Beräkna line_total
    qty = max(1, int(req.quantity or 1))
    if art.price_type == "per_night":
        line_total = Decimal(str(art.price)) * b.nights
    elif art.price_type == "per_guest":
        line_total = Decimal(str(art.price)) * b.guests_count
    elif art.price_type == "per_occasion":
        line_total = Decimal(str(art.price)) * qty
    else:
        line_total = Decimal(str(art.price))

    ba = BookingArticle(
        booking_id=b.id,
        article_id=art.id,
        name_sv=art.name_sv,
        name_en=art.name_en,
        name_de=art.name_de,
        price_snapshot=art.price,
        price_type=art.price_type,
        quantity=1,
        line_total=line_total,
    )
    db.add(ba)

    # Uppdatera belopp
    new_articles_amount = b.articles_amount + line_total
    b.articles_amount = new_articles_amount
    b.total_amount = b.base_amount + new_articles_amount
    deposit_pct = Decimal(str(b.snapshot.get("deposit_pct", 10)))
    b.deposit_amount = (b.total_amount * deposit_pct / 100).quantize(Decimal("1"))

    # Uppdatera snapshot
    snap = dict(b.snapshot)
    snap["articles"] = snap.get("articles", []) + [{
        "article_id": art.id,
        "name_sv": art.name_sv,
        "name_en": art.name_en,
        "name_de": art.name_de,
        "price": float(art.price),
        "price_type": art.price_type,
        "line_total": float(line_total),
    }]
    b.snapshot = snap
    db.commit()
    db.refresh(b)

    return {
        "total_amount": float(b.total_amount),
        "deposit_amount": float(b.deposit_amount),
        "articles_amount": float(b.articles_amount),
        "article": {
            "article_id": art.id,
            "name_sv": art.name_sv,
            "name_en": art.name_en,
            "price_snapshot": float(art.price),
            "price_type": art.price_type,
            "line_total": float(line_total),
        }
    }

# ─── PayPal: Skapa betalning ─────────────────────────
@router.post("/admin/{booking_id}/paypal-create")
async def create_paypal_order(
    booking_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    import httpx, base64
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    
    amount = data.get("amount", float(booking.deposit_amount))
    payment_type = data.get("payment_type", "deposit")
    
    # Hämta PayPal access token
    base_url = "https://api-m.paypal.com" if settings.PAYPAL_MODE == "live" else "https://api-m.sandbox.paypal.com"
    credentials = base64.b64encode(f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_SECRET}".encode()).decode()
    
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
            data="grant_type=client_credentials"
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=500, detail="PayPal autentisering misslyckades")
        access_token = token_res.json()["access_token"]
        
        # Skapa order
        order_res = await client.post(
            f"{base_url}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "reference_id": booking.booking_ref,
                    "description": f"Sjölyckan - {booking.booking_ref} - {'Handpenning' if payment_type == 'deposit' else 'Slutbetalning'}",
                    "amount": {
                        "currency_code": "SEK",
                        "value": str(round(amount, 2))
                    }
                }],
                "application_context": {
                    "return_url": f"{settings.FRONTEND_URL}/pay/success?ref={booking.booking_ref}",
                    "cancel_url": f"{settings.FRONTEND_URL}/pay/cancel?ref={booking.booking_ref}",
                    "brand_name": "Sjölyckan",
                    "locale": "sv-SE",
                    "user_action": "PAY_NOW"
                }
            }
        )
        if order_res.status_code != 201:
            raise HTTPException(status_code=500, detail="Kunde inte skapa PayPal-order")
        
        order = order_res.json()
        approve_url = next((l["href"] for l in order["links"] if l["rel"] == "approve"), None)
        
        return {
            "order_id": order["id"],
            "approve_url": approve_url,
            "amount": amount,
        }

# ─── Tilläggsbegäran ──────────────────────────────────────────────────────────
class AddonRequest(BaseModel):
    booking_ref: str
    article_ids: List[int] = []
    article_quantities: dict = {}
    message: Optional[str] = None

@router.post("/addon-request")
async def create_addon_request(
    req: AddonRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Kund lägger till tillägg på en bekräftad bokning."""
    from app.models.models import BookingAddon, Article, BookingStatus

    booking = db.query(Booking).filter(Booking.booking_ref == req.booking_ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    if booking.status not in (
        BookingStatus.confirmed, BookingStatus.deposit_paid, BookingStatus.paid
    ):
        raise HTTPException(status_code=400, detail="Tillägg kan bara läggas till på bekräftade bokningar")
    if not req.article_ids:
        raise HTTPException(status_code=400, detail="Välj minst ett tillägg")

    articles_snap = []
    total = 0
    for aid in req.article_ids:
        art = db.query(Article).filter(Article.id == aid, Article.active == True, Article.bookable == True).first()
        if not art:
            continue
        qty = int(req.article_quantities.get(str(aid), req.article_quantities.get(aid, 1)) or 1)
        if art.price_type == "per_night":
            line_total = float(art.price) * booking.nights * qty
        elif art.price_type == "per_guest":
            line_total = float(art.price) * booking.guests_count * qty
        elif art.price_type in ("per_occasion", "per_pet"):
            line_total = float(art.price) * qty
        else:
            line_total = float(art.price)
        total += line_total
        articles_snap.append({
            "article_id": art.id, "name_sv": art.name_sv, "name_en": art.name_en,
            "name_de": art.name_de, "price": float(art.price), "price_type": art.price_type,
            "quantity": qty, "line_total": line_total,
        })

    addon = BookingAddon(
        booking_id=booking.id,
        booking_ref=booking.booking_ref,
        articles=articles_snap,
        total_amount=total,
        message=req.message,
    )
    db.add(addon); db.commit(); db.refresh(addon)

    # Notifiera admin
    background_tasks.add_task(_notify_addon_admin, addon.id)

    return {
        "ok": True,
        "addon_id": addon.id,
        "booking_ref": booking.booking_ref,
        "total_amount": float(total),
        "articles": articles_snap,
    }


async def _notify_addon_admin(addon_id: int):
    """Skickar adminmail om ny tilläggsbegäran."""
    from app.models.database import SessionLocal
    from app.email.service import send_email
    from app.core.config import settings
    db = SessionLocal()
    try:
        from app.models.models import BookingAddon
        addon = db.query(BookingAddon).filter(BookingAddon.id == addon_id).first()
        if not addon: return
        booking = addon.booking
        rows = "".join(
            f"<tr><td>{a['name_sv']}</td><td>{a['quantity']} st</td><td>{a['line_total']:,.0f} kr</td></tr>"
            for a in addon.articles
        )
        html = f"""<h2>Ny tilläggsbegäran</h2>
        <p>Bokning: <strong>{booking.booking_ref}</strong> — {booking.guest_name}</p>
        <table border="1" cellpadding="6">
        <tr><th>Tillägg</th><th>Antal</th><th>Belopp</th></tr>
        {rows}
        <tr><td colspan="2"><strong>Totalt</strong></td><td><strong>{float(addon.total_amount):,.0f} kr</strong></td></tr>
        </table>
        {"<p><em>" + addon.message + "</em></p>" if addon.message else ""}
        <p><a href="{settings.FRONTEND_URL}/admin">Hantera i admin →</a></p>"""
        await send_email(settings.ADMIN_EMAIL, f"Ny tilläggsbegäran — {booking.booking_ref}", html)
    finally:
        db.close()

# ─── E-postverifiering ────────────────────────────────────────────────────────
@router.get("/verify-email")
def verify_email(token: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Kund klickar länken i verifieringsmail — aktiverar bokningen."""
    b = db.query(Booking).filter(Booking.email_verify_token == token).first()
    if not b:
        raise HTTPException(status_code=404, detail="Ogiltig länk")
    if b.email_verify_expires and b.email_verify_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Länken har gått ut")
    if b.status != BookingStatus.pending_email_verify:
        # Redan verifierad
        return {"ok": True, "already_verified": True, "booking_ref": b.booking_ref}
    b.status = BookingStatus.pending
    b.email_verify_token = None
    b.email_verify_expires = None
    # Markera kundens konto som e-postverifierat — framtida bokningar slipper verifiering
    if b.guest_email:
        _u = db.query(User).filter(User.email == b.guest_email.strip().lower()).first()
        if _u:
            _u.email_verified = True
    # Släpp ÄVEN andra obekräftade bokningar med samma e-post — en bekräftelse räcker.
    also_released = []
    if b.guest_email:
        _others = db.query(Booking).filter(
            Booking.guest_email == b.guest_email,
            Booking.status == BookingStatus.pending_email_verify,
            Booking.id != b.id,
        ).all()
        for _o in _others:
            _o.status = BookingStatus.pending
            _o.email_verify_token = None
            _o.email_verify_expires = None
            also_released.append(_o.id)
    db.commit()
    # Skicka booking_request till kund och admin (via BackgroundTasks — fungerar i sync-route)
    background_tasks.add_task(send_booking_email_by_id, b.id, "booking_request")
    background_tasks.add_task(send_booking_email_by_id, b.id, "admin_new_booking", True)
    # Samma mail för de andra som släpptes
    for _oid in also_released:
        background_tasks.add_task(send_booking_email_by_id, _oid, "booking_request")
        background_tasks.add_task(send_booking_email_by_id, _oid, "admin_new_booking", True)
    return {"ok": True, "booking_ref": b.booking_ref}


async def _send_admin_pending_verify(booking_id: int):
    """Notifiera admin om ny bokningsförfrågan som väntar på kundens e-postbekräftelse."""
    from app.models.database import SessionLocal
    from app.email.service import send_email
    from app.core.config import settings
    db = SessionLocal()
    try:
        b = db.query(Booking).filter(Booking.id == booking_id).first()
        if not b:
            return
        persons = f"{b.guests_count} gäster"
        if b.adults_count is not None or b.children_count is not None:
            persons = f"{b.adults_count or 0} vuxna, {b.children_count or 0} barn"
            if b.pets_count:
                persons += f", {b.pets_count} husdjur"
        html = f"""<h2>Ny bokningsförfrågan — väntar på e-postbekräftelse</h2>
        <p>Bokning: <strong>{b.booking_ref}</strong> — {b.guest_name}</p>
        <p><strong>Kunden har ännu inte bekräftat sin e-postadress.</strong>
        Bokningsförfrågan blir aktiv först när kunden klickat på verifieringslänken.
        Länken är giltig i 48 timmar.</p>
        <table border="1" cellpadding="6">
        <tr><td>E-post</td><td>{b.guest_email}</td></tr>
        <tr><td>Telefon</td><td>{b.guest_phone or "-"}</td></tr>
        <tr><td>Ankomst</td><td>{b.date_from}</td></tr>
        <tr><td>Avresa</td><td>{b.date_to}</td></tr>
        <tr><td>Nätter</td><td>{b.nights}</td></tr>
        <tr><td>Gäster</td><td>{persons}</td></tr>
        <tr><td>Belopp</td><td>{float(b.total_amount):,.0f} kr</td></tr>
        </table>
        {"<p><em>" + b.message + "</em></p>" if b.message else ""}
        <p>Du kan skicka om verifieringsmailet från admin om kunden inte hittar det.</p>
        <p><a href="{settings.FRONTEND_URL}/admin">Hantera i admin →</a></p>"""
        await send_email(settings.ADMIN_EMAIL, f"Väntar på e-bekräftelse — {b.booking_ref}", html)
    except Exception as exc:
        logger.error(f"Kunde inte skicka admin-notis (pending verify) för {booking_id}: {exc}")
    finally:
        db.close()


async def _send_email_verify(booking_id: int):
    """Skickar verifieringsmail till kunden."""
    from app.models.database import SessionLocal
    from app.email.service import send_email
    from app.core.config import settings
    db = SessionLocal()
    try:
        b = db.query(Booking).filter(Booking.id == booking_id).first()
        if not b: return
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={b.email_verify_token}"
        lang = b.lang or "sv"
        subjects = {
            "sv": "Bekräfta din e-postadress — Sjölyckan",
            "en": "Confirm your email address — Sjölyckan",
            "de": "Bestätigen Sie Ihre E-Mail-Adresse — Sjölyckan",
        }
        intros = {
            "sv": f"Hej {b.guest_name.split()[0]}! Klicka på knappen nedan för att bekräfta din e-postadress och skicka in din bokningsförfrågan.",
            "en": f"Hi {b.guest_name.split()[0]}! Click the button below to confirm your email address and submit your booking request.",
            "de": f"Hallo {b.guest_name.split()[0]}! Klicken Sie auf den Button unten, um Ihre E-Mail-Adresse zu bestätigen und Ihre Buchungsanfrage einzureichen.",
        }
        btn_labels = {"sv": "Bekräfta e-postadress", "en": "Confirm email address", "de": "E-Mail-Adresse bestätigen"}
        expire_notes = {
            "sv": "Länken är giltig i 48 timmar.",
            "en": "The link is valid for 48 hours.",
            "de": "Der Link ist 48 Stunden gültig.",
        }
        contact_notes = {
            "sv": "Har du frågor? Svara på detta mejl så återkommer vi.",
            "en": "Questions? Just reply to this email and we'll get back to you.",
            "de": "Fragen? Antworten Sie einfach auf diese E-Mail.",
        }
        html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="font-family:Georgia,serif">{subjects[lang]}</h2>
          <p>{intros[lang]}</p>
          <p style="margin:24px 0">
            <a href="{verify_url}" style="background:#2c5f8a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500">
              {btn_labels[lang]}
            </a>
          </p>
          <p style="color:#888;font-size:13px">{expire_notes[lang]}</p>
          <p style="color:#888;font-size:13px">{contact_notes[lang]}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#888;font-size:12px">Sjölyckan · Rolsmo, Småland</p>
        </div>"""
        await send_email(b.guest_email, subjects[lang], html)
    finally:
        db.close()
