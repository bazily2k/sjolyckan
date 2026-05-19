from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta
from app.models.database import get_db
from app.models.models import Season, Article, Booking, BookingStatus, PriceOverride
from app.core.booking_logic import get_price_for_date

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/articles")
def public_articles(lang: str = "sv", db: Session = Depends(get_db)):
    """Returnerar synliga och bokningsbara tillägg för gäster."""
    articles = db.query(Article).filter(
        Article.active == True,
        Article.visible == True,
    ).order_by(Article.sort_order, Article.id).all()

    result = []
    for a in articles:
        name = getattr(a, f"name_{lang}", a.name_sv)
        desc = getattr(a, f"desc_{lang}", a.desc_sv)
        result.append({
            "id": a.id,
            "name": name,
            "desc": desc,
            "price": float(a.price),
            "price_type": a.price_type,
            "icon": a.icon,
            "bookable": a.bookable,
        })
    return result


@router.get("/availability")
def public_availability(
    year: int = None,
    month: int = None,
    db: Session = Depends(get_db),
):
    """
    Returnerar tillgänglighet och priser för en månad.
    Används av kalenderkomponenten på bokningssidan.
    """
    today = date.today()
    if not year:
        year = today.year
    if not month:
        month = today.month

    # Beräkna alla dagar i månaden
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)

    # Hämta bekräftade bokningar som överlappar månaden
    booked_dates = set()
    pending_dates = set()
    bookings = db.query(Booking).filter(
        Booking.status.in_([
            BookingStatus.confirmed,
            BookingStatus.deposit_paid,
            BookingStatus.paid,
        ]),
        Booking.date_from < end,
        Booking.date_to > start,
    ).all()

    for b in bookings:
        d = b.date_from
        while d < b.date_to:
            booked_dates.add(d)
            d += timedelta(days=1)

    pending_bookings = db.query(Booking).filter(
        Booking.status == BookingStatus.pending,
        Booking.date_from < end,
        Booking.date_to > start,
    ).all()
    for b in pending_bookings:
        d = b.date_from
        while d < b.date_to:
            if d not in booked_dates:
                pending_dates.add(d)
            d += timedelta(days=1)

    # Bygg kalenderdata
    days = []
    d = start
    while d < end:
        price, season = get_price_for_date(db, d)
        days.append({
            "date": str(d),
            "available": d not in booked_dates and d >= today,
            "status": "pending" if d in pending_dates else "booked" if d in booked_dates else "past" if d < today else "available",
            "price": float(price) if price else None,
            "season": season.name_sv if season else None,
            "past": d < today,
        })
        d += timedelta(days=1)

    return {"year": year, "month": month, "days": days}


@router.get("/seasons")
def public_seasons(lang: str = "sv", db: Session = Depends(get_db)):
    """Returnerar aktiva och synliga säsonger för gäster."""
    seasons = db.query(Season).filter(
        Season.active == True,
        Season.visible == True,
    ).order_by(Season.date_from).all()

    return [
        {
            "name": getattr(s, f"name_{lang}", s.name_sv),
            "date_from": str(s.date_from),
            "date_to": str(s.date_to),
            "price_per_night": float(s.price_per_night),
            "min_nights": s.min_nights,
            "deposit_pct": float(s.deposit_pct),
        }
        for s in seasons
    ]
