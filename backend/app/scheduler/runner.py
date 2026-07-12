"""
Schemalagd process som körs en gång per dygn.
Skickar påminnelser och markerar förfallna bokningar.
"""
import asyncio
import logging
from datetime import date, timedelta, datetime, timezone
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.models.database import SessionLocal
from app.models.models import Booking, Payment, BookingStatus, PaymentStatus, PaymentType
from app.email.service import send_booking_email

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_daily_checks():
    logger.info("Kör dagliga bokningskontroller...")
    db: Session = SessionLocal()
    try:
        today = date.today()
        confirmed_bookings = db.query(Booking).filter(
            Booking.status.in_([
                BookingStatus.confirmed,
                BookingStatus.deposit_paid,
            ])
        ).all()

        for booking in confirmed_bookings:
            snap = booking.snapshot
            r1 = snap.get("reminder_1_days", 14)
            r2 = snap.get("reminder_2_days", 3)

            # ── Handpenning förfallen ───────────────────
            if (booking.status == BookingStatus.confirmed
                    and booking.deposit_due_date
                    and booking.deposit_due_date < today):
                deposit_payment = next(
                    (p for p in booking.payments
                     if p.type == PaymentType.deposit and p.status == PaymentStatus.paid),
                    None
                )
                if not deposit_payment:
                    logger.warning(f"Bokning {booking.booking_ref}: handpenning förfallen")
                    await send_booking_email(db, booking, "deposit_overdue")
                    await send_booking_email(db, booking, "admin_new_booking", to_admin=True)

            # ── Påminnelse slutbetalning ─────────────────
            if booking.payment_due_date:
                days_left = (booking.payment_due_date - today).days

                if days_left == r1:
                    logger.info(f"Bokning {booking.booking_ref}: påminnelse 1 ({r1} dagar)")
                    await send_booking_email(db, booking, "payment_reminder")

                elif days_left == r2:
                    logger.info(f"Bokning {booking.booking_ref}: påminnelse 2 ({r2} dagar)")
                    await send_booking_email(db, booking, "payment_reminder")

                elif days_left < 0:
                    # Förfallen — notifiera admin
                    final_payment = next(
                        (p for p in booking.payments
                         if p.type in (PaymentType.final, PaymentType.full)
                         and p.status == PaymentStatus.paid),
                        None
                    )
                    if not final_payment:
                        logger.warning(f"Bokning {booking.booking_ref}: slutbetalning förfallen")
                        await send_booking_email(db, booking, "payment_overdue")

            # ── Välkomstmejl: på valt datum om satt, annars dagen innan ankomst ─
            _send_day = booking.checkin_send_date or (booking.date_from - timedelta(days=1))
            if _send_day == today:
                if booking.status in (BookingStatus.paid, BookingStatus.deposit_paid):
                    logger.info(f"Bokning {booking.booking_ref}: skickar välkomstmejl")
                    await send_booking_email(db, booking, "checkin_info")

        # ── Påminnelse: obekräftad e-postadress ──────
        now = datetime.now(timezone.utc)
        unverified = db.query(Booking).filter(
            Booking.status == BookingStatus.pending_email_verify,
            Booking.email_verify_reminder_sent == False,
            Booking.email_verify_expires.isnot(None),
        ).all()
        for b in unverified:
            if (b.email_verify_expires and now < b.email_verify_expires
                    and now >= b.email_verify_expires - timedelta(hours=24)):
                logger.info(f"Bokning {b.booking_ref}: paminnelse om e-postbekraftelse")
                b.email_verify_reminder_sent = True
                db.commit()
                from app.routes.bookings import _send_email_verify
                await _send_email_verify(b.id)

    except Exception as e:
        logger.error(f"Fel i dagliga kontroller: {e}")
    finally:
        db.close()


def main():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_daily_checks, "cron", hour=8, minute=0)
    scheduler.start()
    logger.info("Schemaläggaren startad — kör kl. 08:00 varje dag")
    try:
        asyncio.get_event_loop().run_forever()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()


if __name__ == "__main__":
    main()
