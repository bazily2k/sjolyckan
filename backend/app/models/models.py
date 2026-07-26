from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Numeric,
    DateTime, Date, ForeignKey, Enum, JSON
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"
    guest = "guest"
    friend = "friend"


class BookingStatus(str, enum.Enum):
    pending = "pending"           # Förfrågan inkommen
    confirmed = "confirmed"       # Du har godkänt
    deposit_paid = "deposit_paid" # Handpenning betald
    partially_paid = "partially_paid"  # Delbetald (t.ex. efter godkänt tillägg som ökat totalbeloppet)
    paid = "paid"                 # Fullbetald
    cancelled = "cancelled"       # Avbokad
    expired = "expired"           # Betalfrist passerad
    pending_email_verify = "pending_email_verify"  # Väntar på e-postbekräftelse


class PaymentMethod(str, enum.Enum):
    stripe = "stripe"
    swish = "swish"
    paypal = "paypal"
    manual = "manual"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class PaymentType(str, enum.Enum):
    deposit = "deposit"
    final = "final"
    full = "full"


# ─── Användare ──────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone = Column(String(50))
    country = Column(String(10), default="SE")
    address_line1 = Column(String(300))
    address_line2 = Column(String(300))
    postal_code = Column(String(20))
    city = Column(String(200))
    lang = Column(String(5), default="sv")
    role = Column(Enum(UserRole), default=UserRole.guest)
    discount_pct = Column(Numeric(5, 2), default=0)
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    admin_notes = Column(Text, nullable=True)  # interna admin-anteckningar, visas aldrig för kunden
    password_set_by_user = Column(Boolean, default=False)  # True när kunden själv valt/satt sitt lösenord
    email_verified = Column(Boolean, default=False)  # True när kunden bekräftat sin e-post via bokning
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))

    bookings = relationship("Booking", back_populates="user")


# ─── Globala inställningar ──────────────────────────────
class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text)
    description = Column(String(255))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─── Säsonger med alla villkor ──────────────────────────
class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True)
    name_sv = Column(String(100), nullable=False)
    name_en = Column(String(100), nullable=False)
    name_de = Column(String(100), nullable=False)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    price_per_night = Column(Numeric(10, 2), nullable=False)

    # Betalningsvillkor
    deposit_pct = Column(Numeric(5, 2), default=10)       # % handpenning
    deposit_days = Column(Integer, default=7)              # dagar att betala handpenning
    payment_days_before = Column(Integer, default=60)      # slutbet. X dagar innan ankomst
    min_nights = Column(Integer, default=2)                # minsta antal nätter
    extra_guest_fee = Column(Numeric(10,2), default=0)     # extra avgift per gäst över threshold
    extra_guest_threshold = Column(Integer, default=4)     # antal gäster innan extra avgift

    # Påminnelser
    reminder_1_days = Column(Integer, default=14)          # dagar före betalfrist
    reminder_2_days = Column(Integer, default=3)
    cancellation_deposit_days = Column(Integer, default=120)
    cancellation_full_days = Column(Integer, default=60)
    cancellation_refund_deposit = Column(Boolean, default=False)  # återbetalas handpenningen vid avbokning i tid?

    # Synlighet
    visible = Column(Boolean, default=True)                # visas på bokningssidan
    active = Column(Boolean, default=True)                 # kan bokas
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─── Prisöverstyring per enskilt datum ──────────────────
class PriceOverride(Base):
    __tablename__ = "price_overrides"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, unique=True)
    price_per_night = Column(Numeric(10, 2), nullable=False)
    min_nights = Column(Integer)
    note = Column(String(255))                             # t.ex. "Midsommar"
    active = Column(Boolean, default=True)


# ─── Tillägg / Artiklar ─────────────────────────────────
class CheckinInfoItem(Base):
    """Egen infopunkt i incheckningsmailet (rubrik + text per språk, på/av)."""
    __tablename__ = "checkin_info_items"

    id = Column(Integer, primary_key=True)
    title_sv = Column(String(200), nullable=False)
    title_en = Column(String(200), default="")
    title_de = Column(String(200), default="")
    body_sv = Column(Text, default="")
    body_en = Column(Text, default="")
    body_de = Column(Text, default="")
    icon = Column(String(20), default="")   # valfri emoji, t.ex. ℹ️
    item_type = Column(String(20), default="static")  # static | code (kod = unikt värde per bokning)
    image_path = Column(String(300), default="")  # valfri bild (t.ex. QR-kod), URL under /uploads
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)


class BookingCheckinCode(Base):
    """Unikt kodvärde per bokning för en kod-typad infopunkt."""
    __tablename__ = "booking_checkin_codes"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("checkin_info_items.id"), nullable=False)
    value = Column(String(500), default="")


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True)
    name_sv = Column(String(200), nullable=False)
    name_en = Column(String(200), nullable=False)
    name_de = Column(String(200), nullable=False)
    desc_sv = Column(Text)
    desc_en = Column(Text)
    desc_de = Column(Text)
    price = Column(Numeric(10, 2), nullable=False)
    price_type = Column(String(20), default="per_night")   # per_night | per_guest | fixed
    icon = Column(String(50), default="ti-package")
    visible = Column(Boolean, default=True)
    bookable = Column(Boolean, default=True)
    is_deposit = Column(Boolean, default=False)   # återbetalningsbar deposition (utanför handpenning)
    is_pet_fee = Column(Boolean, default=False)   # husdjursavgift, multipliceras med antal husdjur
    sort_order = Column(Integer, default=0)
    active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    booking_articles = relationship("BookingArticle", back_populates="article")


# ─── Bokningar ──────────────────────────────────────────
class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True)
    booking_ref = Column(String(20), unique=True, nullable=False)  # t.ex. SJO-2026-0042

    # Gästinfo
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    guest_name = Column(String(200), nullable=False)
    guest_email = Column(String(255), nullable=False)
    guest_phone = Column(String(50))
    guest_country = Column(String(10), default="SE")
    message = Column(Text, nullable=True)  # kundens meddelande vid bokning
    lang = Column(String(5), default="sv")

    # Datum
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    nights = Column(Integer, nullable=False)
    guests_count = Column(Integer, default=2)
    adults_count = Column(Integer, nullable=True)      # antal vuxna (null för äldre bokningar)
    children_count = Column(Integer, nullable=True)    # antal barn (null för äldre bokningar)
    pets_count = Column(Integer, nullable=True)        # antal husdjur (hundar + katter)

    # ── SNAPSHOT av villkor vid bokningstillfället ──────
    # Dessa ändras ALDRIG efter att bokningen bekräftats
    snapshot = Column(JSON, nullable=False)
    # snapshot innehåller:
    # {
    #   "season_id": 3,
    #   "season_name": "Högsäsong",
    #   "price_per_night": 1800,
    #   "deposit_pct": 10,
    #   "deposit_days": 7,
    #   "payment_days_before": 90,
    #   "min_nights": 7,
    #   "articles": [...],
    #   "confirmed_at": "2026-01-15T10:30:00",
    #   "terms_version": "1.0"
    # }

    # Belopp
    base_amount = Column(Numeric(10, 2), nullable=False)   # pris för nätter
    articles_amount = Column(Numeric(10, 2), default=0)    # summa tillägg
    total_amount = Column(Numeric(10, 2), nullable=False)  # totalt
    deposit_amount = Column(Numeric(10, 2), nullable=False) # handpenning

    # Datum för betalning
    deposit_due_date = Column(Date)
    payment_due_date = Column(Date)

    # Betalning
    payment_method = Column(Enum(PaymentMethod), nullable=True)  # sätts av admin
    payment_methods = Column(String(100), nullable=True)  # kommaseparerad: swish,paypal,stripe
    hidden = Column(Boolean, default=False)
    status = Column(Enum(BookingStatus), default=BookingStatus.pending)

    # Stripe
    stripe_payment_intent_id = Column(String(255))
    stripe_session_id = Column(String(255))

    # Admin-notering
    admin_note = Column(Text)

    # Tidsstämplar
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True))
    checkin_send_date = Column(Date, nullable=True)  # tomt = dagen före ankomst; satt = skicka detta datum
    cancelled_at = Column(DateTime(timezone=True))
    cancellation_reason = Column(Text)
    # Villkorsgodkännande
    terms_accepted = Column(Boolean, default=False)
    gdpr_accepted = Column(Boolean, default=False)
    house_rules_accepted = Column(Boolean, default=False)
    terms_snapshot = Column(JSON, nullable=True)

    # E-postverifiering
    email_verify_token = Column(String(64), nullable=True)
    email_verify_expires = Column(DateTime(timezone=True), nullable=True)
    email_verify_reminder_sent = Column(Boolean, default=False)

    # Relationer
    user = relationship("User", back_populates="bookings")
    addons = relationship("BookingAddon", back_populates="booking")
    articles = relationship("BookingArticle", back_populates="booking")
    payments = relationship("Payment", back_populates="booking")
    email_logs = relationship("EmailLog", back_populates="booking")


# ─── Bokade tillägg ─────────────────────────────────────
class BookingArticle(Base):
    __tablename__ = "booking_articles"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=False)

    # Snapshot av artikel vid bokningstillfället
    name_sv = Column(String(200))
    name_en = Column(String(200))
    name_de = Column(String(200))
    price_snapshot = Column(Numeric(10, 2), nullable=False)
    price_type = Column(String(20))
    quantity = Column(Integer, default=1)
    line_total = Column(Numeric(10, 2))

    booking = relationship("Booking", back_populates="articles")
    article = relationship("Article", back_populates="booking_articles")


# ─── Betalningar ────────────────────────────────────────
class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    type = Column(Enum(PaymentType), nullable=False)       # deposit | final | full
    method = Column(Enum(PaymentMethod), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    due_date = Column(Date)
    paid_at = Column(DateTime(timezone=True))

    # Stripe
    stripe_payment_intent_id = Column(String(255))
    stripe_session_id = Column(String(255))

    # PayPal
    paypal_order_id = Column(String(255))

    # Swish / Manuell
    reference = Column(String(255))                        # Swish-ref eller manuell notering
    note = Column(Text)                                    # admin-notering

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    booking = relationship("Booking", back_populates="payments")


# ─── E-postlogg ─────────────────────────────────────────
class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    email_type = Column(String(100))    # booking_request | confirmed | deposit_reminder etc
    recipient = Column(String(255))
    lang = Column(String(5))
    subject = Column(String(500))
    status = Column(String(20))         # sent | failed
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    error = Column(Text)

    booking = relationship("Booking", back_populates="email_logs")


class Agent(Base):
    """Förmedlare (t.ex. Airbnb, Booking.com) som vi hyr ut via."""
    __tablename__ = "agents"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    url = Column(String(500))
    notes = Column(Text, nullable=True)  # allmän info, t.ex. adress/villkor
    # Kontaktpersoner: [{"name": "", "email": "", "mobile": "", "is_primary": bool}, ...]
    contacts = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BlockedDate(Base):
    __tablename__ = "blocked_dates"
    id = Column(Integer, primary_key=True)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    reason = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Förmedlar-bokning: om agent_id är satt representerar blockeringen en
    # gästbokning gjord via en extern förmedlare, med samma typ av gästinfo
    # som våra egna bokningar (visas i admin-kalendern med annan färg).
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
    guest_name = Column(String(200), nullable=True)
    guest_email = Column(String(255), nullable=True)
    guest_phone = Column(String(50), nullable=True)
    guest_country = Column(String(10), nullable=True)
    adults_count = Column(Integer, nullable=True)
    children_count = Column(Integer, nullable=True)
    pets_count = Column(Integer, nullable=True)

    agent = relationship("Agent")

class BookingAddon(Base):
    """Tilläggsbegäran kopplad till en bekräftad bokning."""
    __tablename__ = "booking_addons"

    id           = Column(Integer, primary_key=True, index=True)
    booking_id   = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    booking_ref  = Column(String(20), nullable=False, index=True)
    status       = Column(String(20), default="pending")   # pending | confirmed | rejected
    articles     = Column(JSON, nullable=False, default=list)  # snapshot
    total_amount = Column(Numeric(10, 2), default=0)
    discount_amount = Column(Numeric(10, 2), default=0)  # samma rabatt-% som gällde vid bokningen
    message      = Column(Text, nullable=True)
    admin_note   = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    booking = relationship("Booking", back_populates="addons")
