import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path
from app.core.config import settings
from app.models.models import Booking, EmailLog
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

template_dir = Path(__file__).parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(str(template_dir)),
    autoescape=select_autoescape(["html"]),
)

async def send_email(to: str, subject: str, html: str) -> bool:
    # Välj leverantör baserat på inställning i DB eller .env
    provider = settings.EMAIL_PROVIDER
    logger.info(f"send_email anropad, provider={provider}, to={to}")
    try:
        from app.models.database import SessionLocal
        from app.models.models import Setting
        db = SessionLocal()
        s = db.query(Setting).filter(Setting.key == 'email_provider').first()
        if s and s.value:
            provider = s.value
        db.close()
    except Exception:
        pass
    if provider == 'brevo':
        return await send_via_brevo(to, subject, html)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.mailersend.com/v1/email",
                headers={
                    "Authorization": f"Bearer {settings.MAILSEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": {"email": settings.MAIL_FROM, "name": settings.MAIL_FROM_NAME},
                    "to": [{"email": to}],
                    "subject": subject,
                    "html": html,
                },
                timeout=30,
            )
            if response.status_code in (200, 202):
                return True
            logger.error(f"Mailsend API fel: {response.status_code} {response.text}")
            return False
    except Exception as e:
        logger.error(f"Misslyckades skicka mail till {to}: {e}")
        return False


def log_email(db: Session, booking_id: int, email_type: str,
              recipient: str, lang: str, subject: str, status: str, error: str = None):
    log = EmailLog(
        booking_id=booking_id,
        email_type=email_type,
        recipient=recipient,
        lang=lang,
        subject=subject,
        status=status,
        error=error,
    )
    db.add(log)
    db.commit()


SUBJECTS = {
    "booking_request": {
        "sv": "Din bokningsförfrågan – Sjölyckan, Rolsmo",
        "en": "Your booking request – Sjölyckan, Rolsmo",
        "de": "Ihre Buchungsanfrage – Sjölyckan, Rolsmo",
    },
    "booking_confirmed": {
        "sv": "Bokningsbekräftelse – Sjölyckan, Rolsmo #{ref}",
        "en": "Booking confirmation – Sjölyckan, Rolsmo #{ref}",
        "de": "Buchungsbestätigung – Sjölyckan, Rolsmo #{ref}",
    },
    "booking_rejected": {
        "sv": "Din bokningsförfrågan – Sjölyckan, Rolsmo",
        "en": "Your booking request – Sjölyckan, Rolsmo",
        "de": "Ihre Buchungsanfrage – Sjölyckan, Rolsmo",
    },
    "deposit_reminder": {
        "sv": "Påminnelse: Handpenning förfaller snart – {ref}",
        "en": "Reminder: Deposit due soon – {ref}",
        "de": "Erinnerung: Anzahlung bald fällig – {ref}",
    },
    "payment_reminder": {
        "sv": "Påminnelse: Slutbetalning förfaller {date} – {ref}",
        "en": "Reminder: Final payment due {date} – {ref}",
        "de": "Erinnerung: Restzahlung fällig {date} – {ref}",
    },
    "admin_new_booking": {
        "sv": "Ny bokningsförfrågan inkommen – {ref}",
        "en": "New booking request – {ref}",
        "de": "Neue Buchungsanfrage – {ref}",
    },
    "checkin_info": {
        "sv": "Välkommen till Sjölyckan! Incheckning imorgon – {ref}",
        "en": "Welcome to Sjölyckan! Check-in tomorrow – {ref}",
        "de": "Willkommen in Sjölyckan! Check-in morgen – {ref}",
    },
}


def render_booking_email(booking: Booking, email_type: str, db=None) -> str:
    lang = booking.lang or "sv"
    snap = booking.snapshot
    ctx = {
        "booking": booking,
        "snap": snap,
        "lang": lang,
        "frontend_url": settings.FRONTEND_URL,
        "swish_number": _get_setting(db, "swish_number") or settings.SWISH_NUMBER,
        "admin_email": settings.ADMIN_EMAIL,
    }
    try:
        template = jinja_env.get_template(f"{email_type}_{lang}.html")
    except Exception:
        template = jinja_env.get_template(f"{email_type}_sv.html")
    return template.render(**ctx)


def _get_setting(db, key: str):
    try:
        from app.models.models import Setting
        s = db.query(Setting).filter(Setting.key == key).first()
        return s.value if s else None
    except Exception:
        return None


async def send_booking_email(
    db: Session,
    booking: Booking,
    email_type: str,
    to_admin: bool = False,
) -> bool:
    lang = booking.lang or "sv"
    if to_admin:
        recipient = settings.ADMIN_EMAIL
    else:
        # Föredra kopplat kontots e-post (kan ha rättats av admin) framför guest_email
        recipient = (booking.user.email if booking.user_id and booking.user else None) or booking.guest_email

    subj_template = SUBJECTS.get(email_type, {}).get(lang, "Sjölyckan")
    subject = subj_template.format(
        ref=booking.booking_ref,
        date=str(booking.payment_due_date),
    )

    actual_type = "admin_new_booking" if to_admin else email_type
    html = render_booking_email(booking, actual_type, db)
    ok = await send_email(recipient, subject, html)
    log_email(db, booking.id, email_type, recipient, lang, subject, "sent" if ok else "failed")
    return ok


async def send_via_brevo(to_email: str, subject: str, html: str) -> bool:
    """Skicka via Brevo SMTP."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    logger.info(f"Skickar via Brevo till {to_email}")
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        from_email = settings.BREVO_FROM if settings.BREVO_FROM else settings.MAIL_FROM
        msg['From'] = f"{settings.MAIL_FROM_NAME} <{from_email}>"
        msg['To'] = to_email
        msg.attach(MIMEText(html, 'html', 'utf-8'))
        with smtplib.SMTP(settings.BREVO_SMTP_SERVER, settings.BREVO_SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.BREVO_LOGIN, settings.BREVO_PASSWORD)
            server.sendmail(settings.MAIL_FROM, to_email, msg.as_string())
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Brevo SMTP fel: {e}")
        return False


async def send_booking_email_by_id(booking_id: int, email_type: str, to_admin: bool = False):
    """Hämtar bokning från ny session och skickar mail — undviker DetachedInstanceError."""
    from app.models.database import SessionLocal
    from app.models.models import Booking
    booking = None
    db = SessionLocal()
    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if booking:
            await send_booking_email(db, booking, email_type, to_admin=to_admin)
    except Exception as exc:
        logger.error(f"send_booking_email_by_id({booking_id}, {email_type}) kraschade: {exc}")
        try:
            from app.models.models import EmailLog
            recip = settings.ADMIN_EMAIL if to_admin else (booking.guest_email if booking else "unknown")
            db.add(EmailLog(
                booking_id=booking_id,
                email_type=email_type,
                recipient=recip,
                status="failed",
                error=str(exc)[:500],
            ))
            db.commit()
        except Exception as log_exc:
            logger.error(f"Kunde inte logga mejlfel: {log_exc}")
    finally:
        db.close()


async def send_simple_email(db, to_email: str, subject: str, html: str):
    """Skicka ett enkelt e-postmeddelande — använder samma logik som send_booking_email."""
    from app.models.models import Setting, EmailLog
    from datetime import datetime
    try:
        try:
            provider = db.query(Setting).filter(Setting.key == "email_provider").first()
            use_brevo = provider and provider.value == "brevo"
        except Exception:
            use_brevo = settings.EMAIL_PROVIDER == "brevo"
        if use_brevo:
            ok = await send_via_brevo(to_email, subject, html)
        else:
            ok = await send_email(to_email, subject, html)
        # Logga inte till email_logs (booking_id kan inte vara NULL)
        if not ok:
            import logging
            logging.getLogger(__name__).error(f"send_simple_email failed to send to {to_email}")
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"send_simple_email failed: {e}")
