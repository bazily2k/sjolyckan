from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.models import (
    Booking, Payment, BookingStatus,
    PaymentMethod, PaymentStatus, PaymentType
)
from app.core.config import settings
import httpx, base64
from datetime import datetime, timezone

router = APIRouter(prefix="/api/pay", tags=["payments"])

DESC = {
    "deposit": {"sv": "Handpenning", "en": "Deposit", "de": "Anzahlung"},
    "final":   {"sv": "Slutbetalning", "en": "Final payment", "de": "Restzahlung"},
}
LOCALE = {"sv": "sv-SE", "en": "en-US", "de": "de-DE"}


async def _paypal_token(base_url: str, client: httpx.AsyncClient) -> str:
    credentials = base64.b64encode(
        f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_SECRET}".encode()
    ).decode()
    r = await client.post(
        f"{base_url}/v1/oauth2/token",
        headers={"Authorization": f"Basic {credentials}",
                 "Content-Type": "application/x-www-form-urlencoded"},
        data="grant_type=client_credentials",
    )
    if r.status_code != 200:
        raise HTTPException(status_code=500, detail="PayPal autentisering misslyckades")
    return r.json()["access_token"]


def _paypal_base():
    return "https://api-m.paypal.com" if settings.PAYPAL_MODE == "live" \
           else "https://api-m.sandbox.paypal.com"


def _booking_due(booking: Booking, db: Session = None):
    if booking.status == BookingStatus.confirmed:
        return float(booking.deposit_amount), "deposit", booking.deposit_due_date
    if booking.status == BookingStatus.deposit_paid:
        return (float(booking.total_amount) - float(booking.deposit_amount),
                "final", booking.payment_due_date)
    if booking.status == BookingStatus.partially_paid and db is not None:
        # Uppstår t.ex. när ett tillägg godkänts efter att bokningen redan
        # var fullbetald — resterande belopp mot det NYA totalbeloppet.
        remaining = float(booking.total_amount) - _amount_paid(db, booking)
        return round(remaining, 2), "final", booking.payment_due_date
    return None, None, None


def _amount_paid(db: Session, booking: Booking) -> float:
    """Summa redan betalt (status=paid) for bokningen."""
    from sqlalchemy import func
    paid = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.booking_id == booking.id,
        Payment.status == PaymentStatus.paid,
    ).scalar()
    return float(paid or 0)


def _resolve_amount(db: Session, booking: Booking, data: dict,
                    due_amount, payment_type):
    """
    Bestam belopp och typ server-side. Litar ALDRIG blint pa klientens belopp.
      pay_full=True  -> resterande (total - redan betalt)
      amount angivet -> maste matcha staged due ELLER full remaining
    """
    full_remaining = round(float(booking.total_amount) - _amount_paid(db, booking), 2)
    expected_due = round(float(due_amount), 2)
    if data.get("pay_full"):
        return full_remaining, "final"
    req = data.get("amount")
    if req is not None:
        req = round(float(req), 2)
        if abs(req - full_remaining) < 0.5:
            return full_remaining, "final"
        if abs(req - expected_due) < 0.5:
            return expected_due, payment_type
        raise HTTPException(status_code=400, detail="Ogiltigt belopp")
    return expected_due, payment_type


@router.get("/{ref}")
async def get_payment_info(ref: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.booking_ref == ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    due_amount, payment_type, due_date = _booking_due(booking, db)
    if not payment_type:
        raise HTTPException(status_code=400, detail="Inga betalningar väntar")
    # Hämta swish-nummer från inställningar
    from app.models.models import Setting
    swish_setting = db.query(Setting).filter(Setting.key == "swish_number").first()
    swish_number = swish_setting.value if swish_setting else None

    return {
        "booking_ref":      booking.booking_ref,
        "guest_first_name": booking.guest_name.split()[0],
        "date_from":        str(booking.date_from),
        "date_to":          str(booking.date_to),
        "nights":           booking.nights,
        "total_amount":     float(booking.total_amount),
        "deposit_amount":   float(booking.deposit_amount),
        "due_amount":       due_amount,
        "payment_type":     payment_type,
        "due_date":         str(due_date) if due_date else None,
        "status":           booking.status.value,
        "lang":             booking.lang or "en",
        "swish_number":     swish_number,
        "payment_methods":  booking.payment_methods or "swish,paypal,stripe",
        "total_amount":     float(booking.total_amount),
        "deposit_amount":   float(booking.deposit_amount),
    }


@router.post("/{ref}/paypal-create")
async def create_paypal_order(ref: str, data: dict = {}, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.booking_ref == ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")
    due_amount, payment_type, _ = _booking_due(booking, db)
    if not payment_type:
        raise HTTPException(status_code=400, detail="Inga betalningar väntar")
    # Belopp avgörs server-side (litar ej på klientens belopp)
    due_amount, payment_type = _resolve_amount(db, booking, data, due_amount, payment_type)
    lang = booking.lang or "en"
    description = DESC[payment_type].get(lang, DESC[payment_type]["en"])
    base_url = _paypal_base()
    async with httpx.AsyncClient() as client:
        token = await _paypal_token(base_url, client)
        r = await client.post(
            f"{base_url}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "reference_id": booking.booking_ref,
                    "description":  f"Sjolyckan - {booking.booking_ref} - {description}",
                    "amount": {
                        "currency_code": "SEK",
                        "value": str(round(due_amount, 2)),
                    },
                }],
                "application_context": {
                    "return_url":   f"{settings.FRONTEND_URL}/pay/success?ref={booking.booking_ref}",
                    "cancel_url":   f"{settings.FRONTEND_URL}/pay/cancel?ref={booking.booking_ref}",
                    "brand_name":   "Sjolyckan",
                    "locale":       LOCALE.get(lang, "en-US"),
                    "user_action":  "PAY_NOW",
                    "landing_page": "BILLING",
                },
            },
        )
        if r.status_code != 201:
            raise HTTPException(status_code=500,
                                detail=f"Kunde inte skapa PayPal-order: {r.text}")
        order = r.json()
        approve_url = next(
            (l["href"] for l in order["links"] if l["rel"] == "approve"), None
        )
    return {"order_id": order["id"], "approve_url": approve_url,
            "amount": due_amount, "payment_type": payment_type}


@router.post("/paypal-capture")
async def capture_paypal_order(data: dict, background_tasks: BackgroundTasks,
                               db: Session = Depends(get_db)):
    order_id = data.get("order_id")
    ref      = data.get("ref")
    if not order_id or not ref:
        raise HTTPException(status_code=400, detail="order_id och ref krävs")
    booking = db.query(Booking).filter(Booking.booking_ref == ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    # Undvik dubbel-capture
    existing = db.query(Payment).filter(
        Payment.paypal_order_id == order_id
    ).first()
    if existing:
        return {
            "success":      True,
            "booking_ref":  booking.booking_ref,
            "payment_type": existing.type.value,
            "amount":       float(existing.amount),
            "status":       booking.status.value,
            "lang":         booking.lang or "en",
        }

    due_amount, payment_type, _ = _booking_due(booking, db)
    if not payment_type:
        raise HTTPException(status_code=400, detail="Inga betalningar väntar")

    base_url = _paypal_base()
    async with httpx.AsyncClient() as client:
        token = await _paypal_token(base_url, client)
        r = await client.post(
            f"{base_url}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"},
        )
        if r.status_code not in (200, 201):
            details = r.json().get("details", [{}])
            if not (details and details[0].get("issue") == "ORDER_ALREADY_CAPTURED"):
                raise HTTPException(status_code=500,
                                    detail=f"PayPal capture misslyckades: {r.text}")

    # Hämta faktiskt betalt belopp + verifiera att ordern hör till bokningen
    try:
        paypal_data = r.json()
        pu = paypal_data.get("purchase_units", [{}])[0]
        ref_id = pu.get("reference_id")
        if ref_id and ref_id != booking.booking_ref:
            raise HTTPException(status_code=400,
                                detail="Betalningen hör inte till denna bokning")
        capture = pu.get("payments", {}).get("captures", [{}])[0]
        actual_amount = float(capture.get("amount", {}).get("value", due_amount))
        if actual_amount >= float(booking.total_amount) * 0.99:
            payment_type = "final"
            due_amount = actual_amount
    except HTTPException:
        raise
    except Exception:
        pass
    p_type = PaymentType.deposit if payment_type == "deposit" else PaymentType.final

    payment = Payment(
        booking_id=booking.id,
        type=p_type,
        method=PaymentMethod.paypal,
        amount=due_amount,
        status=PaymentStatus.paid,
        paid_at=datetime.now(timezone.utc),
        paypal_order_id=order_id,
    )
    db.add(payment)
    booking.payment_method = PaymentMethod.paypal
    db.flush()
    from app.core.booking_logic import recalc_booking_status
    new_status = recalc_booking_status(db, booking)
    db.commit()

    if new_status == BookingStatus.deposit_paid:
        from app.email.service import send_booking_email_by_id
        background_tasks.add_task(send_booking_email_by_id, booking.id, "deposit_confirmed")

    return {
        "success":      True,
        "booking_ref":  booking.booking_ref,
        "payment_type": p_type.value,
        "amount":       due_amount,
        "status":       new_status.value,
        "lang":         booking.lang or "en",
    }


# -- POST /pay/{ref}/stripe-create -- skapa Stripe checkout ----------------
@router.post("/{ref}/stripe-create")
async def create_stripe_session(ref: str, data: dict = {}, db: Session = Depends(get_db)):
    import stripe as stripe_lib
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe ej konfigurerat")

    booking = db.query(Booking).filter(Booking.booking_ref == ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    due_amount, payment_type, _ = _booking_due(booking, db)
    if not payment_type:
        raise HTTPException(status_code=400, detail="Inga betalningar väntar")
    # Belopp avgörs server-side (litar ej på klientens belopp)
    due_amount, payment_type = _resolve_amount(db, booking, data, due_amount, payment_type)

    lang = booking.lang or "en"
    desc = DESC[payment_type].get(lang, DESC[payment_type]["en"])

    session = stripe_lib.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "sek",
                "product_data": {"name": f"Sjölyckan – {booking.booking_ref} – {desc}"},
                "unit_amount": int(due_amount * 100),
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{settings.FRONTEND_URL}/pay/success?ref={booking.booking_ref}&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/pay/cancel?ref={booking.booking_ref}",
        metadata={
            "booking_ref": booking.booking_ref,
            "payment_type": payment_type,
        },
    )
    return {"session_id": session.id, "url": session.url,
            "amount": due_amount, "payment_type": payment_type}


# -- POST /pay/stripe-capture -- bekräfta Stripe-betalning -----------------
@router.post("/stripe-capture")
async def capture_stripe_payment(data: dict, background_tasks: BackgroundTasks,
                                 db: Session = Depends(get_db)):
    import stripe as stripe_lib
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY

    session_id = data.get("session_id")
    ref        = data.get("ref")
    if not session_id or not ref:
        raise HTTPException(status_code=400, detail="session_id och ref krävs")

    booking = db.query(Booking).filter(Booking.booking_ref == ref).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    # Undvik dubbel-registrering
    existing = db.query(Payment).filter(
        Payment.stripe_session_id == session_id
    ).first()
    if existing:
        return {
            "success":      True,
            "booking_ref":  booking.booking_ref,
            "payment_type": existing.type.value,
            "amount":       float(existing.amount),
            "status":       booking.status.value,
            "lang":         booking.lang or "en",
        }

    due_amount, payment_type, _ = _booking_due(booking, db)
    if not payment_type:
        raise HTTPException(status_code=400, detail="Inga betalningar väntar")

    # Verifiera betalning hos Stripe + att sessionen hör till bokningen
    try:
        session = stripe_lib.checkout.Session.retrieve(session_id)
        meta_ref = (session.get("metadata") or {}).get("booking_ref")
        if meta_ref and meta_ref != booking.booking_ref:
            raise HTTPException(status_code=400,
                                detail="Betalningen hör inte till denna bokning")
        if session.payment_status != "paid":
            raise HTTPException(status_code=400, detail="Betalningen ej genomförd")
        # Hämta faktiskt betalt belopp från Stripe
        actual_amount = session.amount_total / 100
        if actual_amount >= float(booking.total_amount) * 0.99:
            payment_type = "final"
            due_amount = actual_amount
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe-fel: {str(e)}")

    p_type = PaymentType.deposit if payment_type == "deposit" else PaymentType.final

    payment = Payment(
        booking_id=booking.id,
        type=p_type,
        method=PaymentMethod.stripe,
        amount=due_amount,
        status=PaymentStatus.paid,
        paid_at=datetime.now(timezone.utc),
        stripe_session_id=session_id,
    )
    db.add(payment)
    booking.payment_method = PaymentMethod.stripe
    db.flush()
    from app.core.booking_logic import recalc_booking_status
    new_status = recalc_booking_status(db, booking)
    db.commit()

    if new_status == BookingStatus.deposit_paid:
        from app.email.service import send_booking_email_by_id
        background_tasks.add_task(send_booking_email_by_id, booking.id, "deposit_confirmed")

    return {
        "success":      True,
        "booking_ref":  booking.booking_ref,
        "payment_type": p_type.value,
        "amount":       due_amount,
        "status":       new_status.value,
        "lang":         booking.lang or "en",
    }
