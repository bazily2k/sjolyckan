from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date
from decimal import Decimal
from app.models.database import get_db
from app.models.models import (
    Booking, BookingStatus, PaymentMethod, Payment,
    PaymentType, PaymentStatus, User
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
    guest_country: str = "SE"
    guest_address: Optional[str] = None
    lang: str = "sv"
    guests_count: int = 2
    date_from: date
    date_to: date
    article_ids: List[int] = []
    message: Optional[str] = None


class PriceCheckRequest(BaseModel):
    date_from: date
    date_to: date
    guests_count: int = 2
    article_ids: List[int] = []
    guest_email: Optional[str] = None


class AdminConfirmRequest(BaseModel):
    payment_method: PaymentMethod
    admin_note: Optional[str] = None


class AdminPaymentRequest(BaseModel):
    payment_type: PaymentType
    amount: float
    reference: Optional[str] = None
    note: Optional[str] = None


# ─── Publik: Priskalkyl ─────────────────────────────────
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
            discount_pct=discount_pct
        )
        return {
            "nights": calc["nights"],
            "base_amount": float(calc["base_amount"]),
            "articles_amount": float(calc["articles_amount"]),
            "total_amount": float(calc["total_amount"]),
            "discount_amount": float(calc["discount_amount"]),
            "discount_pct": float(calc["snapshot"]["discount_pct"]),
            "extra_guest_fee": float(calc["extra_guest_fee"]) if calc.get("extra_guest_fee") else 0,
            "deposit_amount": float(calc["deposit_amount"]),
            "deposit_pct": calc["snapshot"]["deposit_pct"],
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
    try:
        discount_pct = Decimal('0')
        if req.guest_email:
            user = db.query(User).filter(User.email == req.guest_email).first()
            if user and user.discount_pct:
                discount_pct = Decimal(str(user.discount_pct))
        calc = calculate_booking_price(
            db, req.date_from, req.date_to,
            req.guests_count, req.article_ids,
            discount_pct=discount_pct
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    booking = create_booking_record(db, req.dict(), calc)

    # Uppdatera användarprofil om e-post matchar befintligt konto
    try:
        existing_user = db.query(User).filter(User.email == req.guest_email).first()
        if existing_user:
            if req.guest_phone:
                existing_user.phone = req.guest_phone
            if req.guest_country:
                existing_user.country = req.guest_country
            if req.guest_address:
                parts = [p.strip() for p in req.guest_address.split(",")]
                if len(parts) >= 3:
                    existing_user.address_line1 = parts[0]
                    existing_user.address_line2 = parts[1]
                    last = parts[-1].strip().split(" ", 1)
                    if len(last) == 2:
                        existing_user.postal_code = last[0]
                        existing_user.city = last[1]
                elif len(parts) == 2:
                    existing_user.address_line1 = parts[0]
                    existing_user.address_line2 = None
                    last = parts[-1].strip().split(" ", 1)
                    if len(last) == 2:
                        existing_user.postal_code = last[0]
                        existing_user.city = last[1]
            db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Profiluppdatering misslyckades: {e}")


    # Skicka mejl till gäst och admin
    background_tasks.add_task(send_booking_email, db, booking, "booking_request")
    background_tasks.add_task(send_booking_email, db, booking, "admin_new_booking", True)

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
    b.admin_note = req.admin_note
    b.confirmed_at = datetime.utcnow()

    # Skapa betalningsposter
    deposit = Payment(
        booking_id=b.id,
        type=PaymentType.deposit,
        method=req.payment_method,
        amount=b.deposit_amount,
        status=PaymentStatus.pending,
        due_date=b.deposit_due_date,
    )
    final = Payment(
        booking_id=b.id,
        type=PaymentType.final,
        method=req.payment_method,
        amount=b.total_amount - b.deposit_amount,
        status=PaymentStatus.pending,
        due_date=b.payment_due_date,
    )
    db.add(deposit)
    db.add(final)
    db.commit()
    db.refresh(b)

    # Skicka bekräftelse till gäst
    background_tasks.add_task(send_booking_email, db, b, "booking_confirmed")

    # Om Stripe — skapa betalningslänk för handpenning
    if req.payment_method == PaymentMethod.stripe and settings.STRIPE_SECRET_KEY:
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
    return {"status": "payment_registered", "booking_status": b.status.value}


# ─── Hjälpfunktioner ────────────────────────────────────
def _booking_summary(b: Booking) -> dict:
    return {
        "id": b.id,
        "booking_ref": b.booking_ref,
        "guest_name": b.guest_name,
        "guest_email": b.guest_email,
        "guest_country": b.guest_country,
        "date_from": str(b.date_from),
        "date_to": str(b.date_to),
        "nights": b.nights,
        "total_amount": float(b.total_amount),
        "deposit_amount": float(b.deposit_amount),
        "status": b.status.value,
        "payment_method": b.payment_method.value if b.payment_method else None,
        "created_at": str(b.created_at),
        "payment_due_date": str(b.payment_due_date),
        "deposit_due_date": str(b.deposit_due_date),
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
        "snapshot": b.snapshot,
        "articles": [
            {
                "name_sv": a.name_sv,
                "name_en": a.name_en,
                "price_snapshot": float(a.price_snapshot),
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
