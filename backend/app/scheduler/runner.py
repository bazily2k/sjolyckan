"""
Schemalagd process som körs en gång per dygn.
Skickar påminnelser och markerar förfallna bokningar.
"""
import asyncio
import logging
import traceback
from datetime import date, timedelta, datetime, timezone
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.models.database import SessionLocal
from app.models.models import Booking, Payment, BookingStatus, PaymentStatus, PaymentType, ClientErrorLog
from app.email.service import send_booking_email, send_email
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _log_scheduler_error(db: Session, ref: str, err: Exception):
    """Sparar ett kraschat schemaläggarsteg i client_error_logs (samma tabell
    som visas under admin → Felrapporter), så det syns tydligt vad som gick fel."""
    try:
        db.add(ClientErrorLog(
            context="scheduler",
            message=f"[{ref}] {err}"[:4000],
            stack=traceback.format_exc()[:4000],
            url="scheduler/run_daily_checks",
        ))
        db.commit()
    except Exception:
        db.rollback()
        logger.error(f"Kunde inte spara felrapport för {ref} i client_error_logs")


async def _send_crash_summary(errors: list):
    """Skickar ett samlat varningsmejl till admin om dagens körning innehöll fel,
    istället för ett mejl per fel (för att undvika spam vid många samtidiga fel)."""
    if not errors:
        return
    rows = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'>{e['ref']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{e['error']}</td></tr>"
        for e in errors
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#a33">⚠️ Fel i schemaläggarens dagliga körning</h2>
      <p>{len(errors)} fel uppstod vid dagens körning ({date.today().isoformat()}).
      Detaljer (inklusive stack trace) finns under admin → Felrapporter.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f5f5f5"><th style="padding:6px 10px;text-align:left">Referens</th><th style="padding:6px 10px;text-align:left">Fel</th></tr>
        {rows}
      </table>
    </div>
    """
    try:
        await send_email(settings.ADMIN_EMAIL, f"⚠️ Sjölyckan: {len(errors)} fel i dagens schemaläggarkörning", html)
    except Exception as e:
        logger.error(f"Kunde inte skicka kraschsammanfattning till admin: {e}")


async def run_daily_checks():
    logger.info("Kör dagliga bokningskontroller...")
    db: Session = SessionLocal()
    errors = []
    try:
        today = date.today()
        confirmed_bookings = db.query(Booking).filter(
            Booking.status.in_([
                BookingStatus.confirmed,
                BookingStatus.deposit_paid,
            ])
        ).all()

        for booking in confirmed_bookings:
            try:
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
                # Tröskelbaserad (<=) istället för exakt datum-träff: annars missas
                # påminnelser helt för sena bokningar (t.ex. en vecka innan ankomst)
                # där days_left aldrig hinner passera exakt r1/r2, samt om
                # schemaläggaren skulle vara nere just den exakta dagen.
                if booking.payment_due_date:
                    days_left = (booking.payment_due_date - today).days
                    reminders_sent = sum(1 for e in booking.email_logs if e.email_type == "payment_reminder")

                    if days_left >= 0:
                        if reminders_sent == 0 and days_left <= r1:
                            logger.info(f"Bokning {booking.booking_ref}: påminnelse 1 (senast {r1} dagar innan förfall, {days_left} kvar)")
                            await send_booking_email(db, booking, "payment_reminder")

                        elif reminders_sent == 1 and days_left <= r2:
                            logger.info(f"Bokning {booking.booking_ref}: påminnelse 2 (senast {r2} dagar innan förfall, {days_left} kvar)")
                            await send_booking_email(db, booking, "payment_reminder")

                    else:
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
            except Exception as e:
                logger.error(f"Fel vid hantering av bokning {booking.booking_ref}: {e}")
                _log_scheduler_error(db, booking.booking_ref, e)
                errors.append({"ref": booking.booking_ref, "error": str(e)})
                continue

        # ── Påminnelse: obekräftad e-postadress ──────
        now = datetime.now(timezone.utc)
        unverified = db.query(Booking).filter(
            Booking.status == BookingStatus.pending_email_verify,
            Booking.email_verify_reminder_sent == False,
            Booking.email_verify_expires.isnot(None),
        ).all()
        for b in unverified:
            try:
                if (b.email_verify_expires and now < b.email_verify_expires
                        and now >= b.email_verify_expires - timedelta(hours=24)):
                    logger.info(f"Bokning {b.booking_ref}: paminnelse om e-postbekraftelse")
                    b.email_verify_reminder_sent = True
                    db.commit()
                    from app.routes.bookings import _send_email_verify
                    await _send_email_verify(b.id)
            except Exception as e:
                logger.error(f"Fel vid e-postverifieringspåminnelse för {b.booking_ref}: {e}")
                _log_scheduler_error(db, b.booking_ref, e)
                errors.append({"ref": b.booking_ref, "error": str(e)})
                continue

    except Exception as e:
        logger.error(f"Fel i dagliga kontroller: {e}")
        _log_scheduler_error(db, "run_daily_checks", e)
        errors.append({"ref": "(hela körningen)", "error": str(e)})
    finally:
        db.close()

    await _send_crash_summary(errors)


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
