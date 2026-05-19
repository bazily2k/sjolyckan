# Sjölyckan Bokningssystem — Driftsättningsguide

## Förutsättningar
- Ubuntu 22.04 på NUC
- Docker + Docker Compose installerat
- Cloudflare-konto med tunnel för rolsmo23.com

---

## Steg 1 — Kopiera projektet till NUC:en

```bash
# På din dator — skicka filerna till NUC:en
scp -r sjolyckan/ ola@<NUC-IP>:~/sjolyckan

# Eller klona från GitHub när du är redo
git clone https://github.com/DITT-KONTO/sjolyckan.git
```

---

## Steg 2 — Skapa .env-fil

```bash
cd ~/sjolyckan
cp .env.example .env
nano .env
```

Fyll i:
- `POSTGRES_PASSWORD` — välj ett starkt lösenord
- `SECRET_KEY` — generera med: `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `GMAIL_APP_PASSWORD` — se nedan
- `STRIPE_SECRET_KEY` — från stripe.com/dashboard
- `SWISH_NUMBER` — ditt Swish-nummer

### Gmail App Password
1. Gå till myaccount.google.com
2. Säkerhet → 2-stegsverifiering (aktivera om inte aktiv)
3. Sök "App-lösenord" → Skapa
4. Välj "Mail" och "Annan enhet" → kopiera lösenordet

---

## Steg 3 — Starta systemet

```bash
cd ~/sjolyckan
docker compose up -d --build
```

Kontrollera att allt startade:
```bash
docker compose ps
docker compose logs backend --tail=50
```

---

## Steg 4 — Skapa admin-konto

```bash
# Öppna ett skal i backend-containern
docker compose exec backend python3 -c "
from app.models.database import SessionLocal
from app.models.models import User, UserRole
from app.core.auth import hash_password
db = SessionLocal()
admin = User(
    email='rolsmo23.36297@gmail.com',
    password_hash=hash_password('DITT_STARKA_LOSENORD'),
    first_name='Per-Ola',
    last_name='',
    role=UserRole.admin,
)
db.add(admin)
db.commit()
print('Admin skapad!')
"
```

---

## Steg 5 — Cloudflare Tunnel

### Skapa tunnel för booking.rolsmo23.com

```bash
# Installera cloudflared om inte installerat
docker run -d \
  --name cloudflared-booking \
  --restart unless-stopped \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run \
  --token DITT_TUNNEL_TOKEN
```

I Cloudflare-dashboarden:
1. Zero Trust → Networks → Tunnels
2. Skapa ny tunnel "sjolyckan-booking"
3. Lägg till public hostname:
   - Subdomain: `booking`
   - Domain: `rolsmo23.com`
   - Service: `http://localhost:3000`

---

## Steg 6 — Verifiera

```bash
# API-hälsa
curl https://booking.rolsmo23.com/api/health

# Loggar
docker compose logs -f
```

---

## Uppdatera systemet

```bash
cd ~/sjolyckan
git pull                          # när du använder GitHub
docker compose up -d --build      # bygg om och starta om
```

---

## Backup av databasen

```bash
# Manuell backup
docker compose exec db pg_dump -U sjolyckan_user sjolyckan > backup_$(date +%Y%m%d).sql

# Automatisk daglig backup (lägg i crontab)
# crontab -e
# 0 3 * * * cd ~/sjolyckan && docker compose exec -T db pg_dump -U sjolyckan_user sjolyckan > ~/backups/sjolyckan_$(date +\%Y\%m\%d).sql
```

---

## Felsökning

```bash
# Se alla loggar
docker compose logs -f

# Starta om en tjänst
docker compose restart backend

# Öppna databasskal
docker compose exec db psql -U sjolyckan_user sjolyckan

# Rensa och börja om (OBS: raderar all data)
docker compose down -v
docker compose up -d --build
```

---

## Portöversikt

| Tjänst    | Port  | Åtkomst         |
|-----------|-------|-----------------|
| Frontend  | 3000  | Via Cloudflare  |
| Backend   | 8000  | Intern          |
| Databas   | 5432  | Intern          |

Endast port 3000 exponeras — resten är internt i Docker-nätverket.
