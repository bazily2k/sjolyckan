import { useState, useEffect } from 'react';
import { publicApi } from '../../lib/api';

const DAYS = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

export default function BookingCalendar({ onSelect, lang = 'sv' }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [calData, setCalData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [hovering, setHovering] = useState(null);

  useEffect(() => {
    setLoading(true);
    publicApi.availability(year, month)
      .then(r => setCalData(r.data.days))
      .catch(() => setCalData([]))
      .finally(() => setLoading(false));
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (day) => {
    if (!day.available) return;
    const d = new Date(day.date);
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(d); setCheckOut(null);
    } else {
      if (d <= checkIn) { setCheckIn(d); setCheckOut(null); return; }
      setCheckOut(d);
      onSelect && onSelect({ checkIn, checkOut: d });
    }
  };

  const isInRange = (dateStr) => {
    if (!checkIn) return false;
    const d = new Date(dateStr);
    const end = checkOut || hovering;
    if (!end) return false;
    return d > checkIn && d < end;
  };

  const isStart = (dateStr) => checkIn && new Date(dateStr).toDateString() === checkIn.toDateString();
  const isEnd = (dateStr) => checkOut && new Date(dateStr).toDateString() === checkOut.toDateString();

  // Bygg kalenderrutnät
  const firstDay = new Date(year, month - 1, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Måndag = 0
  const weeks = [];
  let week = Array(startDow).fill(null);
  for (const day of calData) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={arrowBtn}>‹</button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>
          {MONTHS_SV[month - 1]} {year}
        </span>
        <button onClick={nextMonth} style={arrowBtn}>›</button>
      </div>

      {/* Veckodagar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--ink-pale)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Dagar */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--ink-pale)' }}>Laddar...</div>
      ) : (
        weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {week.map((day, di) => {
              if (!day) return <div key={di} />;
              const start = isStart(day.date);
              const end = isEnd(day.date);
              const inRange = isInRange(day.date);
              const isToday = new Date(day.date).toDateString() === today.toDateString();

              return (
                <div
                  key={di}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => checkIn && !checkOut && setHovering(new Date(day.date))}
                  onMouseLeave={() => setHovering(null)}
                  style={{
                    textAlign: 'center',
                    padding: '6px 2px',
                    cursor: day.available ? 'pointer' : 'default',
                    background: start || end ? 'var(--water)' : inRange ? 'var(--water-pale)' : 'transparent',
                    borderRadius: start ? '50% 0 0 50%' : end ? '0 50% 50% 0' : 'none',
                    opacity: day.past ? 0.3 : 1,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, margin: '0 auto',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%',
                    background: start || end ? 'var(--water)' : 'transparent',
                    border: isToday && !start && !end ? '1.5px solid var(--water)' : 'none',
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: start || end ? 600 : 400,
                      color: start || end ? 'white' : day.available ? 'var(--ink)' : 'var(--ink-pale)',
                      textDecoration: !day.available && !day.past ? 'line-through' : 'none',
                    }}>
                      {new Date(day.date).getDate()}
                    </span>
                    {day.price && day.available && (
                      <span style={{ fontSize: 8, color: start || end ? 'rgba(255,255,255,0.8)' : 'var(--water)', lineHeight: 1 }}>
                        {Math.round(day.price / 100) * 100 / 100}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Vald period */}
      {checkIn && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--water-pale)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {checkIn && <span>Incheckning: <strong>{checkIn.toLocaleDateString('sv-SE')}</strong></span>}
          {checkOut && <span> · Utcheckning: <strong>{checkOut.toLocaleDateString('sv-SE')}</strong></span>}
        </div>
      )}
    </div>
  );
}

const arrowBtn = {
  width: 32, height: 32, border: '1px solid var(--sand-dark)',
  background: 'white', borderRadius: '50%',
  cursor: 'pointer', fontSize: 18, color: 'var(--ink)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
