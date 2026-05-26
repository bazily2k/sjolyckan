from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 timmar

    # ─── Mailsend ───────────────────────────────────────
    MAILSEND_API_KEY: str
    MAIL_FROM: str = "noreply@rolsmo23.com"
    MAIL_FROM_NAME: str = "Sjölyckan, Rolsmo"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    FRONTEND_URL: str = "https://booking.rolsmo23.com"
    NEXT_PUBLIC_API_URL: str = ""
    ADMIN_EMAIL: str
    SWISH_NUMBER: str = ""
    BREVO_SMTP_SERVER: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    BREVO_LOGIN: str = ""
    BREVO_PASSWORD: str = ""
    BREVO_FROM: str = ""
    PAYPAL_CLIENT_ID: str = ""
    PAYPAL_SECRET: str = ""
    PAYPAL_MODE: str = "live"
    EMAIL_PROVIDER: str = "mailersend"

    class Config:
        env_file = ".env"

settings = Settings()
