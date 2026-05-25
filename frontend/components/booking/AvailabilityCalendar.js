import { useState, useEffect, useRef } from 'react';
import { publicApi } from '../../lib/api';

const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS_SV = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYS_DE = ['Mo','Di','Mi','Do','Fr','Sa','So'];

const LABELS = {
  sv: { title:'Tillgänglighet', available:'Ledigt', booked:'Bokat', pending:'Preliminärt bokad', selected:'Vald period', selectInfo:'Klicka på ett ledigt datum för att påbörja bokning', perNight:'/natt' },
  en: { title:'Availability', available:'Available', booked:'Booked', pending:'Provisionally booked', selected:'Selected period', selectInfo:'Click a free date to start booking', perNight:'/night' },
  de: { title:'Verfügbarkeit', available:'Verfügbar', booked:'Gebucht', pending:'Vorläufig gebucht', selected:'Gewählter Zeitraum', selectInfo:'Klicken Sie auf ein freies Datum, um die Buchung zu beginnen', perNight:'/Nacht' },
};

export default function AvailabilityCalendar({ lang = 'sv', onSelectDates }) {
  const today = new Date();
  const [startMonth, setStartMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [monthsData, setMonthsData] = useState([[], [], []]);
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [hovering, setHovering] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const MONTHS = lang === 'en' ? MONTHS_EN : lang === 'de' ? MONTHS_DE : MONTHS_SV;
  const DAYS = lang === 'en' ? DAYS_EN : lang === 'de' ? DAYS_DE : DAYS_SV;
  const L = LABELS[lang] || LABELS.sv;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const getMonthOffset = (offset) => {
    const d = new Date(startMonth.year, startMonth.month - 1 + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  };

  useEffect(() => {
    setLoading(true);
    const months = [0, 1, 2].map(i => getMonthOffset(i));
    Promise.all(months.map(m => publicApi.availability(m.year, m.month)))
      .then(results => setMonthsData(results.map(r => r.data.days)))
      .finally(() => setLoading(false));
  }, [startMonth]);

  const prevMonth = () => {
    const d = new Date(startMonth.year, startMonth.month - 2, 1);
    if (d < new Date(today.getFullYear(), today.getMonth(), 1)) return;
    setStartMonth({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const goNextMonth = () => {
    const d = new Date(startMonth.year, startMonth.month, 1);
    setStartMonth({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const handleDay = (day) => {
    if (!day.available || day.past) return;
    const d = new Date(day.date);
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(d); setCheckOut(null);
    } else {
      if (d <= checkIn) { setCheckIn(d); setCheckOut(null); return; }
      setCheckOut(d);
      onSelectDates && onSelectDates({
        checkIn: checkIn.toISOString().split('T')[0],
        checkOut: d.toISOString().split('T')[0],
      });
    }
  };

  const isStart = (ds) => checkIn && new Date(ds).toDateString() === checkIn.toDateString();
  const isEnd = (ds) => checkOut && new Date(ds).toDateString() === checkOut.toDateString();
  const isInRange = (ds) => {
    if (!checkIn) return false;
    const d = new Date(ds);
    const end = checkOut || hovering;
    return end ? (d > checkIn && d < end) : false;
  };

  const buildWeeks = (days) => {
    if (!days.length) return [];
    const firstDow = (new Date(days[0].date).getDay() + 6) % 7;
    const weeks = [];
    let week = Array(firstDow).fill(null);
    for (const day of days) {
      week.push(day);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  };

  const renderMonth = (days, yr, mo) => (
    <div key={`${yr}-${mo}`}>
      <div style={{ textAlign:'center', fontFamily:'var(--font-display)', fontSize:16, fontWeight:500, marginBottom:12 }}>
        {MONTHS[mo - 1]} {yr}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:500, color:'var(--ink-pale)', padding:'3px 0', textTransform:'uppercase', letterSpacing:'0.3px' }}>{d}</div>
        ))}
      </div>
      {buildWeeks(days).map((week, wi) => (
        <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {week.map((day, di) => {
            if (!day) return <div key={di} />;
            const start = isStart(day.date);
            const end = isEnd(day.date);
            const inRange = isInRange(day.date);
            const isToday = new Date(day.date).toDateString() === today.toDateString();
            const isPending = day.status === 'pending';
            const isBooked = !day.available && !day.past && day.status !== 'pending';
            const num = new Date(day.date).getDate();
            const price = day.price ? Math.round(day.price).toLocaleString('sv-SE') : null;
            return (
              <div key={di}
                onClick={() => handleDay(day)}
                onMouseEnter={() => checkIn && !checkOut && day.available && setHovering(new Date(day.date))}
                onMouseLeave={() => setHovering(null)}
                style={{
                  textAlign:'center', padding:'2px 1px',
                  cursor: day.available && !day.past ? 'pointer' : 'default',
                  background: start || end ? 'var(--water)' : inRange ? 'var(--water-pale)' : 'transparent',
                  borderRadius: start ? '50% 0 0 50%' : end ? '0 50% 50% 0' : 'none',
                }}>
                <div style={{
                  width:'100%', minHeight:38, margin:'0 auto',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  borderRadius:'var(--radius-md)',
                  background: start || end ? 'var(--water)' : isPending ? 'rgba(255,165,0,0.15)' : 'transparent',
                  border: isToday && !start && !end ? '1.5px solid var(--water)' : isPending ? '1.5px solid orange' : 'none',
                  position:'relative', padding:'2px 0',
                }}>
                  <span style={{
                    fontSize:13, lineHeight:1.2,
                    fontWeight: start || end ? 600 : 400,
                    color: start || end ? 'white' : day.past ? 'var(--sand-dark)' : isBooked ? 'var(--red)' : isPending ? 'darkorange' : 'var(--ink)',
                    textDecoration: isBooked ? 'line-through' : 'none',
                  }}>{num}</span>
                  {price && !day.past && !isBooked && !isPending && (
                    <span style={{ fontSize:9, fontWeight:600, color: start || end ? 'rgba(255,255,255,0.9)' : 'var(--water)', lineHeight:1, marginTop:1 }}>
                      {price}
                    </span>
                  )}
                  {(isBooked || isPending) && (
                    <div style={{ position:'absolute', bottom:2, left:'50%', transform:'translateX(-50%)', width:4, height:4, borderRadius:'50%', background: isPending ? 'orange' : 'var(--red)', opacity:0.7 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const visibleMonths = isMobile ? 1 : 3;
  const cols = isMobile ? '1fr' : 'repeat(3, 1fr)';

  return (
    <div style={{ background:'white', borderRadius:'var(--radius-xl)', border:'1px solid var(--sand-dark)', padding:'24px', boxShadow:'var(--shadow-sm)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:20 }}>{L.title}</h3>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <button onClick={goNextMonth} style={navBtn}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--ink-pale)' }}>Laddar...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: cols, gap: isMobile ? 0 : 32 }}>
          {[0, 1, 2].slice(0, visibleMonths).map(i => {
            const m = getMonthOffset(i);
            return renderMonth(monthsData[i] || [], m.year, m.month);
          })}
        </div>
      )}

      <div style={{ display:'flex', gap:16, marginTop:16, paddingTop:16, borderTop:'1px solid var(--sand)', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-light)' }}>
          <div style={{ width:12, height:12, borderRadius:'50%', background:'var(--ink)' }} />
          {L.available}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-light)' }}>
          <div style={{ width:12, height:12, borderRadius:'50%', background:'var(--red)', opacity:0.6 }} />
          {L.booked}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-light)' }}>
          <div style={{ width:12, height:12, borderRadius:'50%', background:'orange', opacity:0.7 }} />
          {L.pending}
        </div>
        {(checkIn || checkOut) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-light)' }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:'var(--water)' }} />
            {L.selected}
          </div>
        )}
      </div>
      {!checkIn && (
        <p style={{ fontSize:12, color:'var(--ink-pale)', marginTop:8, textAlign:'center' }}>{L.selectInfo}</p>
      )}
      {checkIn && !checkOut && (
        <p style={{ fontSize:12, color:'var(--water)', marginTop:8, textAlign:'center' }}>
          {lang==='de' ? `Anreise: ${checkIn.toLocaleDateString('de-DE')} — Abreisedatum wählen` :
           lang==='en' ? `Check-in: ${checkIn.toLocaleDateString('en-GB')} — select check-out date` :
           `Incheckning: ${checkIn.toLocaleDateString('sv-SE')} — välj utcheckningsdatum`}
        </p>
      )}
    </div>
  );
}

const navBtn = { width:32, height:32, border:'1px solid var(--sand-dark)', background:'white', borderRadius:'50%', cursor:'pointer', fontSize:18, color:'var(--ink)', display:'flex', alignItems:'center', justifyContent:'center' };
