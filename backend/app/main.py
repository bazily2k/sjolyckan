from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.models.database import engine
from app.models.models import Base
from app.models.cms_models import Room, GalleryImage, ContentBlock, Amenity, HouseRule
from app.routes import bookings, admin, auth, public
from app.routes.payments import router as payments_router
from app.routes.cms import router as cms_router
from app.models.email_template import EmailTemplate
from app.routes.email_templates import router as email_templates_router
from app.core.config import settings

# Skapa alla tabeller vid start
Base.metadata.create_all(bind=engine)

# Säkerställ DB-objekt som inte uttrycks i ORM-modellerna:
# btree_gist + exclusion constraint som hindrar överlappande (ej cancelled) bokningar.
# Idempotent — körs säkert vid varje start och återskapas automatiskt på en ny/ombyggd databas.
def _ensure_booking_constraints():
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS btree_gist")
            conn.exec_driver_sql("ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_deposit boolean DEFAULT false")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS message text")
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes text")
            conn.exec_driver_sql("ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_pet_fee boolean DEFAULT false")
            # Booking addons
            conn.exec_driver_sql("""
                CREATE TABLE IF NOT EXISTS booking_addons (
                    id SERIAL PRIMARY KEY,
                    booking_id INTEGER NOT NULL REFERENCES bookings(id),
                    booking_ref VARCHAR(20) NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    articles JSONB DEFAULT '[]'::jsonb,
                    total_amount NUMERIC(10,2) DEFAULT 0,
                    message TEXT,
                    admin_note TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_booking_addons_booking_ref ON booking_addons(booking_ref)")
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_by_user boolean DEFAULT false")
            conn.exec_driver_sql("""
                CREATE TABLE IF NOT EXISTS checkin_info_items (
                    id SERIAL PRIMARY KEY,
                    title_sv VARCHAR(200) NOT NULL,
                    title_en VARCHAR(200) DEFAULT '',
                    title_de VARCHAR(200) DEFAULT '',
                    body_sv TEXT DEFAULT '',
                    body_en TEXT DEFAULT '',
                    body_de TEXT DEFAULT '',
                    icon VARCHAR(20) DEFAULT '',
                    active BOOLEAN DEFAULT true,
                    sort_order INTEGER DEFAULT 0
                )
            """)
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(64)")
            conn.exec_driver_sql("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_email_verify' AND enumtypid = 'bookingstatus'::regtype) THEN ALTER TYPE bookingstatus ADD VALUE 'pending_email_verify'; END IF; END $$")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email_verify_reminder_sent BOOLEAN DEFAULT false")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adults_count integer")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS children_count integer")
            conn.exec_driver_sql("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pets_count integer")
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false")
            # Backfill: konton utan giltig reset_token har redan satt lösenord (gamla konton innan denna kolumn fanns)
            conn.exec_driver_sql("""
                UPDATE users SET password_set_by_user = true
                WHERE password_set_by_user = false
                  AND (reset_token IS NULL OR reset_token_expires IS NULL OR reset_token_expires < now())
            """)
            conn.exec_driver_sql(
                "DO $$ BEGIN "
                "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_bookings') THEN "
                "ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings "
                "EXCLUDE USING gist (daterange(date_from, date_to, '[)') WITH &&) "
                "WHERE (status <> 'cancelled'); "
                "END IF; END $$;"
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Kunde inte säkerställa boknings-constraints: {e}")

_ensure_booking_constraints()

# Seeda standard-bekvämligheter och husregler om tabellerna är tomma (bevarar tidigare hårdkodat innehåll)


def _seed_email_templates():
    """Seedar systemmallar från .html-filer om de inte redan finns i databasen."""
    from app.models.database import SessionLocal
    from app.email.service import SUBJECTS, template_dir
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader(str(template_dir)))
    db = SessionLocal()
    SYSTEM_TRIGGERS = [
        ("booking_request",   "Bokningsförfrågan till gäst",   "guest", 1),
        ("admin_new_booking", "Ny bokning till admin",          "admin", 2),
        ("booking_confirmed", "Bokningsbekräftelse",            "guest", 3),
        ("booking_rejected",  "Bokning nekad",                  "guest", 4),
        ("booking_cancelled", "Avbokning",                      "guest", 5),
        ("payment_reminder",  "Betalningspåminnelse",           "guest", 6),
        ("checkin_info",      "Incheckning imorgon",            "guest", 7),
    ]
    try:
        for trigger, name, recipient, order in SYSTEM_TRIGGERS:
            if db.query(EmailTemplate).filter(EmailTemplate.trigger == trigger).first():
                continue
            bodies = {}
            for lang in ("sv", "en", "de"):
                try:
                    bodies[lang] = env.loader.get_source(env, f"{trigger}_{lang}.html")[0]
                except Exception:
                    bodies[lang] = bodies.get("sv", "")
            subjects = SUBJECTS.get(trigger, {})
            t = EmailTemplate(
                name=name, trigger=trigger, recipient=recipient,
                is_system=True, is_active=True, sort_order=order,
                subject_sv=subjects.get("sv",""), subject_en=subjects.get("en",""),
                subject_de=subjects.get("de",""),
                body_sv=bodies["sv"], body_en=bodies["en"], body_de=bodies["de"],
            )
            db.add(t)
        db.commit()
    except Exception as e:
        import logging; logging.getLogger(__name__).error(f"_seed_email_templates: {e}")
    finally:
        db.close()

def _seed_cms_defaults():
    from app.models.database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(Amenity).count() == 0:
            amenities = [
                ("🌊", "Sjöutsikt", "Lake view", "Seeblick"),
                ("🏖", "Strand & brygga", "Beach & dock", "Strand & Steg"),
                ("🍳", "Fullt utrustat kök", "Fully equipped kitchen", "Voll ausgestattete Küche"),
                ("📶", "WiFi", "WiFi", "WLAN"),
                ("🧺", "Tvättstuga", "Laundry room", "Waschküche"),
                ("⚓", "Privat brygga", "Private dock", "Privatsteg"),
            ]
            for i, (icon, sv, en, de) in enumerate(amenities):
                db.add(Amenity(icon=icon, label_sv=sv, label_en=en, label_de=de, sort_order=i))
        if db.query(HouseRule).count() == 0:
            rules = [
                ("Incheckning efter kl. 15:00", "Check-in after 3:00 PM", "Check-in ab 15:00 Uhr"),
                ("Utcheckning innan kl. 12:00", "Check-out before 12:00 PM", "Check-out vor 12:00 Uhr"),
                ("Max 8 gäster", "Max 8 guests", "Max. 8 Gäste"),
                ("Egna sängkläder medbringas", "Bring your own bed linen", "Eigene Bettwäsche mitbringen"),
                ("Inga husdjur i sangar eller soffor", "No pets on beds or sofas", "Keine Haustiere auf Betten oder Sofas"),
                ("Gästen städar vid utcheckning", "Guests clean on checkout", "Gäste reinigen beim Auschecken"),
            ]
            for i, (sv, en, de) in enumerate(rules):
                db.add(HouseRule(label_sv=sv, label_en=en, label_de=de, sort_order=i))
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).warning(f"Kunde inte seeda CMS-default: {e}")
    finally:
        db.close()

_seed_email_templates()
_seed_cms_defaults()

# Skapa upload-mappar
upload_dir = Path("/app/uploads")
upload_dir.mkdir(parents=True, exist_ok=True)
(upload_dir / "rooms").mkdir(exist_ok=True)
(upload_dir / "gallery").mkdir(exist_ok=True)

app = FastAPI(
    title="Sjölyckan Booking API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Serva uppladdade bilder statiskt
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(public.router)
app.include_router(bookings.router)
app.include_router(admin.router)
app.include_router(cms_router)
app.include_router(email_templates_router)
app.include_router(payments_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Sjölyckan Booking API"}


@app.on_event("startup")
async def startup_event():
    from app.models.database import SessionLocal
    from app.models.models import Setting, Season, Article
    from app.models.cms_models import Room, GalleryImage, ContentBlock
    from datetime import date

    db = SessionLocal()
    try:
        # Grundinställningar
        defaults = [
            ("property_name", "Sjölyckan, Rolsmo"),
            ("property_address", "Rolsmo, Linneryd, Kronobergs län"),
            ("checkin_time", "15:00"),
            ("checkout_time", "12:00"),
            ("max_guests", "8"),
            ("swish_number", settings.SWISH_NUMBER),
            ("booking_ref_style", "sequential"),
        ]
        for key, value in defaults:
            if not db.query(Setting).filter(Setting.key == key).first():
                db.add(Setting(key=key, value=value))

        # Grundsäsonger
        if db.query(Season).count() == 0:
            seasons = [
                Season(name_sv="Lågsäsong", name_en="Low season", name_de="Nebensaison",
                       date_from=date(2026, 1, 1), date_to=date(2026, 4, 30),
                       price_per_night=1200, deposit_pct=10, deposit_days=7,
                       payment_days_before=30, min_nights=2),
                Season(name_sv="Mellansäsong", name_en="Mid season", name_de="Mittelsaison",
                       date_from=date(2026, 5, 1), date_to=date(2026, 5, 31),
                       price_per_night=1500, deposit_pct=10, deposit_days=7,
                       payment_days_before=60, min_nights=2),
                Season(name_sv="Högsäsong", name_en="High season", name_de="Hochsaison",
                       date_from=date(2026, 6, 1), date_to=date(2026, 8, 31),
                       price_per_night=1800, deposit_pct=10, deposit_days=7,
                       payment_days_before=90, min_nights=7),
                Season(name_sv="Mellansäsong", name_en="Mid season", name_de="Mittelsaison",
                       date_from=date(2026, 9, 1), date_to=date(2026, 9, 30),
                       price_per_night=1500, deposit_pct=10, deposit_days=7,
                       payment_days_before=60, min_nights=2),
                Season(name_sv="Lågsäsong", name_en="Low season", name_de="Nebensaison",
                       date_from=date(2026, 10, 1), date_to=date(2026, 12, 31),
                       price_per_night=1200, deposit_pct=10, deposit_days=7,
                       payment_days_before=30, min_nights=2),
            ]
            for s in seasons:
                db.add(s)

        # Grundartiklar
        if db.query(Article).count() == 0:
            articles = [
                Article(name_sv="Sängkläder", name_en="Bed linen", name_de="Bettwäsche",
                        desc_sv="Påslakan + örngott per person", desc_en="Per person", desc_de="Pro Person",
                        price=150, price_type="per_guest", icon="ti-bed", sort_order=1),
                Article(name_sv="Handdukar", name_en="Towels", name_de="Handtücher",
                        desc_sv="Set per person", desc_en="Per person", desc_de="Pro Person",
                        price=80, price_type="per_guest", icon="ti-wash", sort_order=2),
                Article(name_sv="Bastu", name_en="Sauna", name_de="Sauna",
                        desc_sv="Uppvärmd bastu", desc_en="Heated sauna", desc_de="Beheizte Sauna",
                        price=300, price_type="per_night", icon="ti-flame", sort_order=3),
                Article(name_sv="Båt", name_en="Rowing boat", name_de="Ruderboot",
                        desc_sv="Roddbåt med åror", desc_en="With oars", desc_de="Mit Rudern",
                        price=200, price_type="per_night", icon="ti-anchor", sort_order=4),
                Article(name_sv="Kajak", name_en="Kayak", name_de="Kajak",
                        desc_sv="Enkel havskajak", desc_en="Single sea kayak", desc_de="Einfaches Kajak",
                        price=250, price_type="per_night", icon="ti-ripple", sort_order=5),
                Article(name_sv="Kanot", name_en="Canoe", name_de="Kanu",
                        desc_sv="Kanot för 2 personer", desc_en="For 2 persons", desc_de="Für 2 Personen",
                        price=200, price_type="per_night", icon="ti-ripple", sort_order=6),
            ]
            for a in articles:
                db.add(a)

        # Standard innehållsblock
        default_content = [
            ("hero_title", "Sjölyckan", "Sjölyckan", "Sjölyckan", "Sidans huvudrubrik"),
            ("hero_subtitle", "Rolsmo, Småland", "Rolsmo, Småland", "Rolsmo, Småland", "Undertitel i hero"),
            ("hero_tagline", "En sommar att minnas vid Rolsmosjön", "A summer to remember at Rolsmosjön", "Ein Sommer zum Erinnern am Rolsmosjön", "Tagline i hero"),
            ("about_title", "Om Sjölyckan", "About Sjölyckan", "Über Sjölyckan", "Rubrik för om-sektionen"),
            ("about_text", "Koppla av med hela familjen i detta fridfulla boende vid Rolsmosjön. Där finns en egen liten badstrand med brygga. Finare badplats finns på 5 minuters gångavstånd (ca 500 meter). Två separata sovrum samt två ytterligare rum med sovplatser. Stort vardagsrum och matsalsrum, kök och tvättstuga.", "Relax with the whole family in this peaceful lakeside retreat at Rolsmosjön. There is a private little beach with a dock. A nicer bathing spot is a 5-minute walk away.", "Erholen Sie sich mit der ganzen Familie in dieser friedvollen Unterkunft am Rolsmosjön.", "Beskrivningstext om stugan"),
            ("capacity", "8 gäster · 4 sovrum · 4 sängar · 1,5 badrum", "8 guests · 4 bedrooms · 4 beds · 1.5 bathrooms", "8 Gäste · 4 Schlafzimmer · 4 Betten · 1,5 Bäder", "Kapacitetsinfo"),
            ("checkin_rule", "Incheckning efter kl. 15:00", "Check-in after 3:00 PM", "Check-in ab 15:00 Uhr", "Incheckningsregel"),
            ("checkout_rule", "Utcheckning innan kl. 12:00", "Check-out before 12:00 PM", "Check-out vor 12:00 Uhr", "Utcheckningsregel"),
            ("max_guests_rule", "Max 8 gäster", "Maximum 8 guests", "Maximal 8 Gäste", "Max gäster regel"),
            ("linen_rule", "Egna sängkläder medbringas (eller boka som tillägg)", "Bring your own bed linen (or book as add-on)", "Eigene Bettwäsche mitbringen (oder als Extra buchen)", "Sängklädesregel"),
            ("pets_rule", "Inga husdjur i sängar eller soffor", "No pets on beds or sofas", "Keine Haustiere auf Betten oder Sofas", "Husdjursregel"),
            ("cleaning_rule", "Gästen städar vid utcheckning", "Guests clean before checkout", "Gäste reinigen bei Abreise", "Städregel"),
            ("amenities_title", "Bekvämligheter", "Amenities", "Ausstattung", "Bekvämligheter-rubrik"),
            ("sleep_title", "Var du sover", "Where you sleep", "Schlafbereiche", "Sovrubrik"),
            ("rules_title", "Husregler", "House rules", "Hausregeln", "Husregler-rubrik"),
        ]
        for key, sv, en, de, desc in default_content:
            if not db.query(ContentBlock).filter(ContentBlock.key == key).first():
                db.add(ContentBlock(key=key, value_sv=sv, value_en=en, value_de=de, description=desc))

        # Standard rum (om inga finns)
        if db.query(Room).count() == 0:
            rooms = [
                Room(name_sv="Sovrum 1", name_en="Bedroom 1", name_de="Schlafzimmer 1",
                     beds_sv="1 dubbelsäng", beds_en="1 double bed", beds_de="1 Doppelbett",
                     image_path=None, sort_order=1),
                Room(name_sv="Sovrum 2", name_en="Bedroom 2", name_de="Schlafzimmer 2",
                     beds_sv="1 enkelsäng", beds_en="1 single bed", beds_de="1 Einzelbett",
                     image_path=None, sort_order=2),
                Room(name_sv="Sovrum 3", name_en="Bedroom 3", name_de="Schlafzimmer 3",
                     beds_sv="1 dubbelsäng", beds_en="1 double bed", beds_de="1 Doppelbett",
                     image_path=None, sort_order=3),
                Room(name_sv="Sovrum 4", name_en="Bedroom 4", name_de="Schlafzimmer 4",
                     beds_sv="1 dubbelsäng", beds_en="1 double bed", beds_de="1 Doppelbett",
                     image_path=None, sort_order=4),
            ]
            for r in rooms:
                db.add(r)

        db.commit()
    finally:
        db.close()
