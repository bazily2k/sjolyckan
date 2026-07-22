from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import Season, PriceOverride, Article, Booking, BookingArticle, Payment
from app.models.models import BookingStatus, PaymentMethod, PaymentType, PaymentStatus


def generate_booking_ref(db: Session) -> str:
    import random, string as string_mod
    year = date.today().year
    # Kolla inställning
    try:
        from app.models.models import Setting
        s = db.query(Setting).filter(Setting.key == "booking_ref_style").first()
        style = s.value if s else "sequential"
    except Exception:
        style = "sequential"

    if style == "random":
        while True:
            suffix = "".join(random.choices(string_mod.digits, k=4))
            ref = f"SJO-{year}-{suffix}"
            exists = db.query(Booking).filter(Booking.booking_ref == ref).first()
            if not exists:
                return ref
    else:
        from sqlalchemy import func
        last = db.query(func.max(Booking.booking_ref)).filter(
            Booking.booking_ref.like(f"SJO-{year}-%")
        ).scalar()
        if last:
            try:
                last_num = int(last.split("-")[-1])
            except ValueError:
                last_num = 0
        else:
            last_num = 0
        return f"SJO-{year}-{last_num + 1:04d}"


def get_season_for_date(db: Session, d: date) -> Optional[Season]:
    """Hitta aktiv säsong för ett datum."""
    return db.query(Season).filter(
        Season.date_from <= d,
        Season.date_to >= d,
        Season.active == True,
    ).first()


def get_price_for_date(db: Session, d: date) -> tuple[Decimal, Optional[Season]]:
    """
    Returnerar (pris, säsong) för ett datum.
    PriceOverride har högst prioritet, sedan Season.
    """
    override = db.query(PriceOverride).filter(
        PriceOverride.date == d,
        PriceOverride.active == True,
    ).first()
    if override:
        season = get_season_for_date(db, d)
        return override.price_per_night, season

    season = get_season_for_date(db, d)
    if season:
        return season.price_per_night, season

    return None, None


def _calc_err(lang: str, key: str, **kw) -> str:
    lang = lang if lang in ("en", "de") else "sv"
    msgs = {
        "checkout_after_checkin": {
            "sv": "Utcheckning måste vara efter incheckning",
            "en": "Check-out must be after check-in",
            "de": "Check-out muss nach dem Check-in liegen",
        },
        "min_one_night": {
            "sv": "Minst 1 natt krävs",
            "en": "At least 1 night is required",
            "de": "Mindestens 1 Nacht erforderlich",
        },
        "no_price": {
            "sv": "Inget pris definierat för {day}",
            "en": "No price defined for {day}",
            "de": "Kein Preis definiert für {day}",
        },
        "min_nights": {
            "sv": "Minst {n} nätter krävs för denna period",
            "en": "At least {n} nights are required for this period",
            "de": "Mindestens {n} Nächte für diesen Zeitraum erforderlich",
        },
    }
    return msgs[key][lang].format(**kw)


def calculate_booking_price(
    db: Session,
    date_from: date,
    date_to: date,
    guests_count: int,
    article_ids: list[int],
    discount_pct: Decimal = Decimal('0'),
    article_quantities: dict = None,
    lang: str = "sv",
) -> dict:
    """
    Beräkna fullständigt pris och samla ihop snapshot-data.
    """
    nights = (date_to - date_from).days
    if nights <= 0:
        raise ValueError(_calc_err(lang, "checkout_after_checkin"))
    if nights < 1:
        raise ValueError(_calc_err(lang, "min_one_night"))

    # Beräkna nätterpris dag för dag (stöder varierade priser)
    base_amount = Decimal("0")
    daily_prices = []
    dominant_season = None

    for i in range(nights):
        day = date_from + timedelta(days=i)
        price, season = get_price_for_date(db, day)
        if price is None:
            raise ValueError(_calc_err(lang, "no_price", day=day))
        base_amount += price
        daily_prices.append({"date": str(day), "price": float(price)})
        if season and not dominant_season:
            dominant_season = season

    # Tillägg
    articles_data = []
    articles_amount = Decimal("0")
    refundable_deposit_amount = Decimal("0")
    for aid in article_ids:
        art = db.query(Article).filter(
            Article.id == aid,
            Article.active == True,
            Article.visible == True,
            Article.bookable == True,
        ).first()
        if not art:
            continue
        qty = 1
        if art.price_type in ("per_occasion", "per_pet") and article_quantities:
            qty = int(article_quantities.get(str(aid), article_quantities.get(aid, 1)))
            qty = max(1, qty)
        if art.price_type == "per_night":
            line_total = art.price * nights
        elif art.price_type == "per_guest":
            line_total = art.price * guests_count
        elif art.price_type == "per_occasion":
            line_total = art.price * qty
        elif art.price_type == "per_pet":
            line_total = art.price * qty
        else:  # fixed
            line_total = art.price
        if getattr(art, "is_deposit", False):
            refundable_deposit_amount += line_total
        else:
            articles_amount += line_total
        articles_data.append({
            "article_id": art.id,
            "name_sv": art.name_sv,
            "name_en": art.name_en,
            "name_de": art.name_de,
            "desc_sv": art.desc_sv,
            "desc_en": art.desc_en,
            "desc_de": art.desc_de,
            "price": float(art.price),
            "price_type": art.price_type,
            "quantity": qty,
            "line_total": float(line_total),
            "is_deposit": bool(getattr(art, "is_deposit", False)),
        })

    # Auto-inkludera synliga depositioner (kunden kan inte välja bort dem)
    included_ids = {a["article_id"] for a in articles_data}
    for art in db.query(Article).filter(
        Article.is_deposit == True,
        Article.visible == True,
        Article.active == True,
    ).all():
        if art.id in included_ids:
            continue
        if art.price_type == "per_night":
            line_total = art.price * nights
        elif art.price_type == "per_guest":
            line_total = art.price * guests_count
        else:
            line_total = art.price
        refundable_deposit_amount += line_total
        articles_data.append({
            "article_id": art.id,
            "name_sv": art.name_sv,
            "name_en": art.name_en,
            "name_de": art.name_de,
            "desc_sv": art.desc_sv,
            "desc_en": art.desc_en,
            "desc_de": art.desc_de,
            "price": float(art.price),
            "price_type": art.price_type,
            "quantity": 1,
            "line_total": float(line_total),
            "is_deposit": True,
        })

    # Extra avgift för gäster över threshold
    extra_guest_fee = Decimal("0")
    extra_guests = 0
    extra_guest_rate = Decimal("0")
    if dominant_season and hasattr(dominant_season, "extra_guest_fee") and dominant_season.extra_guest_fee:
        threshold = dominant_season.extra_guest_threshold or 4
        if guests_count > threshold:
            extra_guests = guests_count - threshold
            extra_guest_rate = Decimal(str(dominant_season.extra_guest_fee))
            extra_guest_fee = extra_guest_rate * extra_guests * nights

    chargeable_amount = base_amount + articles_amount + extra_guest_fee

    # Applicera rabatt om användaren har discount_pct > 0 (gäller ej deposition)
    discount_amount = Decimal('0')
    if discount_pct and discount_pct > 0:
        discount_amount = (chargeable_amount * discount_pct / 100).quantize(Decimal('1'))
        chargeable_amount = chargeable_amount - discount_amount

    # Säsongsvillkor (använder dominant säsong eller standardvärden)
    deposit_pct = Decimal(str(dominant_season.deposit_pct)) if dominant_season else Decimal("10")
    deposit_days = dominant_season.deposit_days if dominant_season else 7
    payment_days_before = dominant_season.payment_days_before if dominant_season else 60
    reminder_1_days = dominant_season.reminder_1_days if dominant_season else 14
    reminder_2_days = dominant_season.reminder_2_days if dominant_season else 3
    cancellation_deposit_days = dominant_season.cancellation_deposit_days if dominant_season else 120
    cancellation_full_days = dominant_season.cancellation_full_days if dominant_season else 60
    cancellation_refund_deposit = dominant_season.cancellation_refund_deposit if dominant_season else False
    min_nights = dominant_season.min_nights if dominant_season else 2
    if min_nights > 0 and nights < min_nights:
        raise ValueError(_calc_err(lang, "min_nights", n=min_nights))

    deposit_amount = (chargeable_amount * deposit_pct / 100).quantize(Decimal("1"))
    # Återbetalningsbar deposition läggs på totalen men ingår inte i handpenningen
    total_amount = chargeable_amount + refundable_deposit_amount
    deposit_due_date = date.today() + timedelta(days=deposit_days)
    payment_due_date = date_from - timedelta(days=payment_days_before)

    # Om betalfrist är i det förflutna eller innan handpenning, justera
    if payment_due_date <= date.today():
        payment_due_date = date.today() + timedelta(days=1)
    # Slutbetalning måste alltid vara EFTER handpenning
    if payment_due_date <= deposit_due_date:
        payment_due_date = deposit_due_date + timedelta(days=7)

    snapshot = {
        "season_id": dominant_season.id if dominant_season else None,
        "season_name_sv": dominant_season.name_sv if dominant_season else "Standard",
        "season_name_en": dominant_season.name_en if dominant_season else "Standard",
        "season_name_de": dominant_season.name_de if dominant_season else "Standard",
        "price_per_night_avg": float(base_amount / nights),
        "deposit_pct": float(deposit_pct),
        "deposit_days": deposit_days,
        "payment_days_before": payment_days_before,
        "reminder_1_days": reminder_1_days,
        "reminder_2_days": reminder_2_days,
        "cancellation_deposit_days": cancellation_deposit_days,
        "cancellation_full_days": cancellation_full_days,
        "cancellation_refund_deposit": cancellation_refund_deposit,
        "min_nights": min_nights,
        "daily_prices": daily_prices,
        "articles": articles_data,
        "extra_guest_fee": float(extra_guest_fee),
        "refundable_deposit_amount": float(refundable_deposit_amount),
        "extra_guest_threshold": dominant_season.extra_guest_threshold if dominant_season else 4,
        "extra_guests": extra_guests,
        "extra_guest_rate": float(extra_guest_rate),
        "terms_version": "1.0",
        "discount_pct": float(discount_pct),
    }

    return {
        "nights": nights,
        "base_amount": base_amount,
        "articles_amount": articles_amount,
        "refundable_deposit_amount": refundable_deposit_amount,
        "total_amount": total_amount,
        "discount_amount": discount_amount,
        "deposit_amount": deposit_amount,
        "extra_guest_fee": extra_guest_fee,
        "extra_guest_threshold": dominant_season.extra_guest_threshold if dominant_season else 4,
        "extra_guests": extra_guests,
        "extra_guest_rate": extra_guest_rate,
        "deposit_due_date": deposit_due_date,
        "payment_due_date": payment_due_date,
        "snapshot": snapshot,
    }


def create_booking_record(db: Session, data: dict, calc: dict) -> Booking:
    """Skapa bokning med fryst snapshot."""
    booking = Booking(
        booking_ref=generate_booking_ref(db),
        guest_name=data["guest_name"],
        guest_email=data["guest_email"],
        guest_phone=data.get("guest_phone"),
        guest_country=data.get("guest_country", "SE"),
        message=data.get("message"),
        lang=data.get("lang", "sv"),
        guests_count=data.get("guests_count", 2),
        adults_count=data.get("adults_count"),
        children_count=data.get("children_count"),
        pets_count=data.get("pets_count"),
        date_from=data["date_from"],
        date_to=data["date_to"],
        nights=calc["nights"],
        base_amount=calc["base_amount"],
        articles_amount=calc["articles_amount"],
        total_amount=calc["total_amount"],
        deposit_amount=calc["deposit_amount"],
        deposit_due_date=calc["deposit_due_date"],
        payment_due_date=calc["payment_due_date"],
        snapshot=calc["snapshot"],
        status=BookingStatus.pending,
        terms_accepted=data.get("terms_accepted", False),
        gdpr_accepted=data.get("gdpr_accepted", False),
        house_rules_accepted=data.get("house_rules_accepted", False),
        terms_snapshot=data.get("terms_snapshot"),
    )
    db.add(booking)
    db.flush()

    # Spara bokade tillägg
    for art_data in calc["snapshot"]["articles"]:
        ba = BookingArticle(
            booking_id=booking.id,
            article_id=art_data["article_id"],
            name_sv=art_data["name_sv"],
            name_en=art_data["name_en"],
            name_de=art_data["name_de"],
            price_snapshot=art_data["price"],
            price_type=art_data["price_type"],
            quantity=art_data["quantity"],
            line_total=art_data["line_total"],
        )
        db.add(ba)

    db.commit()
    db.refresh(booking)
    return booking


def amount_paid(db: Session, booking: Booking) -> float:
    """Summa hittills betald (status=paid) för bokningen, oavsett betalningstyp."""
    from sqlalchemy import func
    paid = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.booking_id == booking.id,
        Payment.status == PaymentStatus.paid,
    ).scalar()
    return float(paid or 0)


def recalc_booking_status(db: Session, booking: Booking) -> BookingStatus:
    """Räknar om bokningens status utifrån faktiskt betalt belopp mot aktuellt
    total_amount (som kan ha ökat via godkända tilläggsbeställningar).

    Rör aldrig livscykel-status som inte handlar om betalning
    (pending, pending_email_verify, cancelled, expired) — de styrs av annan logik.

    - paid            : allt (inkl. ev. tillägg) är betalt
    - deposit_paid     : bara handpenningen är betald (normalt flöde, väntar på slutbetalning)
    - partially_paid   : något är betalt, men varken hela beloppet eller exakt handpenningen
                          (t.ex. helbetalning gjordes, sedan godkändes ett tillägg som ökade
                          total_amount, så en del av det nya totalbeloppet saknas)
    Ändringen sparas inte automatiskt — anroparen ansvarar för db.commit().
    """
    if booking.status in (
        BookingStatus.pending,
        BookingStatus.pending_email_verify,
        BookingStatus.cancelled,
        BookingStatus.expired,
    ):
        return booking.status

    total_paid = amount_paid(db, booking)
    total = float(booking.total_amount or 0)
    deposit = float(booking.deposit_amount or 0)

    if total_paid >= total - 1:
        booking.status = BookingStatus.paid
    elif total_paid <= 0:
        booking.status = BookingStatus.confirmed
    elif total_paid <= deposit + 1:
        booking.status = BookingStatus.deposit_paid
    else:
        booking.status = BookingStatus.partially_paid

    return booking.status
