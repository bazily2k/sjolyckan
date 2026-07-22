import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const T = {
  sv: {
    title: 'Betala din bokning', loading: 'Hämtar bokningsinformation...',
    not_found: 'Bokning hittades inte', no_payment: 'Inga betalningar väntar',
    greeting: 'Hej', stay: 'Din vistelse', nights: 'nätter',
    deposit_label: 'Handpenning att betala', final_label: 'Slutbetalning att betala',
    due: 'Förfaller', pay_btn: 'Betala med PayPal', processing: 'Öppnar PayPal...',
    error: 'Något gick fel. Försök igen.', stripe_btn: 'Betala med kort', stripe_processing: 'Öppnar betalning...', swish_title: 'Betala med Swish', swish_ref: 'Ange bokningsnummer', secure: 'Säker betalning via PayPal eller kort', no_deposit: 'Ingen handpenning krävs', pay_deposit: 'Betala handpenning', pay_full: 'Betala hela beloppet nu', pay_later: 'Betala senare',
  },
  en: {
    title: 'Pay your booking', loading: 'Loading booking information...',
    not_found: 'Booking not found', no_payment: 'No payments pending',
    greeting: 'Hello', stay: 'Your stay', nights: 'nights',
    deposit_label: 'Deposit to pay', final_label: 'Final payment to pay',
    due: 'Due by', pay_btn: 'Pay with PayPal', processing: 'Opening PayPal...',
    error: 'Something went wrong. Please try again.', stripe_btn: 'Pay by card', stripe_processing: 'Opening payment...', secure: 'Secure payment via PayPal or card', no_deposit: 'No deposit required', pay_deposit: 'Pay deposit', pay_full: 'Pay full amount now', pay_later: 'Pay later',
  },
  de: {
    title: 'Buchung bezahlen', loading: 'Buchungsinformationen werden geladen...',
    not_found: 'Buchung nicht gefunden', no_payment: 'Keine Zahlungen ausstehend',
    greeting: 'Hallo', stay: 'Ihr Aufenthalt', nights: 'Nächte',
    deposit_label: 'Anzahlung zu bezahlen', final_label: 'Restzahlung zu bezahlen',
    due: 'Fällig bis', pay_btn: 'Mit PayPal bezahlen', processing: 'PayPal wird geöffnet...',
    error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.', stripe_btn: 'Mit Karte bezahlen', stripe_processing: 'Zahlung wird geöffnet...', secure: 'Sichere Zahlung über PayPal oder Karte', no_deposit: 'Keine Anzahlung erforderlich', pay_deposit: 'Anzahlung bezahlen', pay_full: 'Gesamtbetrag jetzt bezahlen', pay_later: 'Später bezahlen',
  },
};

const fmtDate = (d, lang) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString(
    lang === 'sv' ? 'sv-SE' : lang === 'de' ? 'de-DE' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );
};
const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);

export default function PayPage() {
  const router = useRouter();
  const { ref } = router.query;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errKey, setErrKey] = useState('');
  const [paying, setPaying] = useState(false);
  const [payingStripe, setPayingStripe] = useState(false);
  const [payMode, setPayMode] = useState('deposit');

  useEffect(() => {
    if (!ref) return;
    axios.get(`/api/pay/${ref}`)
      .then(r => { setBooking(r.data); setLoading(false); })
      .catch(e => {
        setErrKey(e.response?.status === 404 ? 'not_found' : e.response?.status === 400 ? 'no_payment' : 'error');
        setLoading(false);
      });
  }, [ref]);

  const lang = booking?.lang || 'en';
  const t = T[lang] || T.en;

  const handleStripe = async () => {
    setPayingStripe(true);
    try {
      const amount = (payMode === 'full' || booking.deposit_amount === 0)
        ? (booking.status === 'partially_paid' ? booking.due_amount : booking.total_amount)
        : undefined;
      const r = await axios.post(`/api/pay/${ref}/stripe-create`, amount ? { amount } : {});
      window.location.href = r.data.url;
    } catch (e) {
      setErrKey('error');
      setPayingStripe(false);
    }
  };

  const handlePayPal = async () => {
    setPaying(true);
    try {
      const amount = (payMode === 'full' || booking.deposit_amount === 0)
        ? (booking.status === 'partially_paid' ? booking.due_amount : booking.total_amount)
        : undefined;
      const r = await axios.post(`/api/pay/${ref}/paypal-create`, amount ? { amount } : {});
      window.location.href = r.data.approve_url;
    } catch (e) {
      setErrKey('error');
      setPaying(false);
    }
  };

  if (loading) return (
    <div style={s.page}><div style={s.card}><p style={s.center}>{T.en.loading}</p></div></div>
  );

  if (errKey) return (
    <div style={s.page}><div style={s.card}>
      <div style={{ ...s.hdr, background: '#c0392b' }}><h1 style={s.h1}>Sjölyckan</h1></div>
      <p style={{ ...s.center, color: '#888', marginTop: 24 }}>{t[errKey] || t.error}</p>
    </div></div>
  );

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.hdr}>
          <h1 style={s.h1}>Sjölyckan</h1>
          <p style={s.sub}>{t.title}</p>
        </div>
        <p style={s.greeting}>{t.greeting} {booking.guest_first_name},</p>
        <div style={s.infoBox}>
          <div style={s.row}>
            <span>{t.stay}</span>
            <strong>{fmtDate(booking.date_from, lang)} – {fmtDate(booking.date_to, lang)}</strong>
          </div>
          <div style={s.row}>
            <span>{booking.nights} {t.nights}</span>
            <span style={{ color: '#aaa', fontSize: 12 }}>{booking.booking_ref}</span>
          </div>
        </div>
        {booking.payment_type === 'deposit' && booking.deposit_amount === 0 ? (
          <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 14px', fontSize:13, color:'var(--ink-light)', marginBottom:8, textAlign:'center' }}>
            <strong>✓ {t.no_deposit}</strong>
          </div>
        ) : booking.payment_type === 'deposit' ? (
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={() => setPayMode('deposit')} style={{ flex:1, padding:'8px 4px', borderRadius:'var(--radius-md)', border:`2px solid ${payMode==='deposit'?'var(--water)':'var(--sand-dark)'}`, background:payMode==='deposit'?'var(--water-pale)':'white', fontSize:12, cursor:'pointer', fontWeight:payMode==='deposit'?600:400, lineHeight:1.4 }}>
              {t.pay_deposit}<br/><strong>{fmtSEK(booking.deposit_amount)}</strong>
            </button>
            <button onClick={() => setPayMode('full')} style={{ flex:1, padding:'8px 4px', borderRadius:'var(--radius-md)', border:`2px solid ${payMode==='full'?'var(--water)':'var(--sand-dark)'}`, background:payMode==='full'?'var(--water-pale)':'white', fontSize:12, cursor:'pointer', fontWeight:payMode==='full'?600:400, lineHeight:1.4 }}>
              {t.pay_full}<br/><strong>{fmtSEK(booking.total_amount)}</strong>
            </button>
          </div>
        ) : null}
        {booking.deposit_amount > 0 || booking.payment_type !== 'deposit' ? (
          <div style={s.amtBox}>
            <div style={s.amtLabel}>{booking.payment_type === 'deposit' ? (payMode==='deposit' ? t.deposit_label : t.final_label) : t.final_label}</div>
            <div style={s.amt}>{fmtSEK(booking.payment_type === 'deposit' ? (payMode==='deposit' ? booking.deposit_amount : booking.total_amount) : booking.due_amount)}</div>
            {booking.due_date && payMode==='deposit' && (
              <div style={s.due}>{t.due} {fmtDate(booking.due_date, lang)}</div>
            )}
          </div>
        ) : (
          <div style={s.amtBox}>
            <div style={s.amtLabel}>{t.final_label}</div>
            <div style={s.amt}>{fmtSEK(booking.total_amount)}</div>
          </div>
        )}
        {(() => {
          const methods = (booking.payment_methods || 'swish,paypal,stripe').split(',');
          const or = <div style={s.divider}><span>{lang === 'de' ? 'oder' : lang === 'sv' ? 'eller' : 'or'}</span></div>;
          const btns = [];
          if (methods.includes('paypal')) btns.push(
            <button key="pp" onClick={handlePayPal} disabled={paying || payingStripe} style={{ ...s.btn, opacity: paying ? 0.7 : 1 }}>
              {paying ? t.processing : <><span style={{ marginRight: 8 }}>🔵</span>{t.pay_btn}</>}
            </button>
          );
          if (methods.includes('stripe')) btns.push(
            <button key="st" onClick={handleStripe} disabled={paying || payingStripe} style={{ ...s.stripeBtn, opacity: payingStripe ? 0.7 : 1 }}>
              {payingStripe ? t.stripe_processing : <><span style={{ marginRight: 8 }}>💳</span>{t.stripe_btn}</>}
            </button>
          );
          if (methods.includes('swish') && booking.swish_number) btns.push(
            <div key="sw" style={s.swishBox}>
              <div style={s.swishTitle}>📱 {t.swish_title}</div>
              <div style={s.swishNum}>{booking.swish_number}</div>
              <div style={s.swishRef}>{t.swish_ref}: <strong>{booking.booking_ref}</strong></div>
            </div>
          );
          return btns.reduce((acc, btn, i) => i === 0 ? [btn] : [...acc, or, btn], []);
        })()}
        <p style={s.secure}>🔒 {t.secure}</p>
      </div>
    </div>
  );
}

const s = {
  page:    { minHeight: '100vh', background: '#f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial,sans-serif' },
  card:    { background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: 32, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' },
  hdr:     { background: '#1a5276', color: '#fff', borderRadius: 8, padding: '20px 24px', textAlign: 'center', marginBottom: 24 },
  h1:      { margin: 0, fontSize: 22, fontWeight: 700 },
  sub:     { margin: '4px 0 0', fontSize: 14, opacity: 0.85 },
  greeting:{ fontSize: 15, color: '#333', marginBottom: 16 },
  center:  { textAlign: 'center', color: '#666' },
  infoBox: { background: '#f8f6f1', borderRadius: 8, padding: '14px 16px', marginBottom: 16 },
  row:     { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#444', marginBottom: 6 },
  amtBox:  { background: '#eaf3de', borderRadius: 8, padding: '20px 16px', textAlign: 'center', marginBottom: 24 },
  amtLabel:{ fontSize: 14, color: '#555', marginBottom: 6 },
  amt:     { fontSize: 32, fontWeight: 700, color: '#1a5276' },
  due:     { fontSize: 13, color: '#777', marginTop: 6 },
  btn:     { width: '100%', padding: 14, background: '#003087', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  secure:    { textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 12 },
  stripeBtn: { width: '100%', padding: 14, background: '#635bff', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  divider:   { display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', color: '#ccc', fontSize: 12, textAlign: 'center' },
  swishBox:  { background: '#f0faf0', border: '1px solid #a8d8a8', borderRadius: 8, padding: 16, textAlign: 'center', marginTop: 8 },
  swishTitle:{ fontSize: 14, fontWeight: 600, color: '#2d6a2d', marginBottom: 8 },
  swishNum:  { fontSize: 24, fontWeight: 700, color: '#1a5276', marginBottom: 6 },
  swishRef:  { fontSize: 13, color: '#555' },
};
