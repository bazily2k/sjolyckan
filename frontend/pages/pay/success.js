import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const T = {
  sv: {
    processing: 'Bekräftar betalning...', title: 'Betalning genomförd!',
    thank_you: 'Tack för din betalning!',
    deposit_msg: 'Handpenningen är registrerad. Vi hör av oss med mer information.',
    final_msg: 'Slutbetalningen är registrerad. Vi ser fram emot ditt besök!',
    ref: 'Bokningsnummer', amount: 'Betalt belopp', contact: 'Frågor? Kontakta oss:',
    error: 'Något gick fel vid bekräftelsen. Kontakta oss och ange bokningsnumret.',
  },
  en: {
    processing: 'Confirming payment...', title: 'Payment successful!',
    thank_you: 'Thank you for your payment!',
    deposit_msg: 'Your deposit has been registered. We will be in touch shortly.',
    final_msg: 'Your final payment has been registered. We look forward to your visit!',
    ref: 'Booking reference', amount: 'Amount paid', contact: 'Questions? Contact us:',
    error: 'Something went wrong. Please contact us with your reference number.',
  },
  de: {
    processing: 'Zahlung wird bestätigt...', title: 'Zahlung erfolgreich!',
    thank_you: 'Vielen Dank für Ihre Zahlung!',
    deposit_msg: 'Ihre Anzahlung wurde registriert. Wir melden uns in Kürze.',
    final_msg: 'Ihre Restzahlung wurde registriert. Wir freuen uns auf Ihren Besuch!',
    ref: 'Buchungsnummer', amount: 'Bezahlter Betrag', contact: 'Fragen? Kontaktieren Sie uns:',
    error: 'Etwas ist schiefgelaufen. Kontaktieren Sie uns mit Ihrer Referenznummer.',
  },
};

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);

export default function PaySuccess() {
  const router = useRouter();
  const { ref, token } = router.query;
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ref || !token) return;
    axios.post('/api/pay/paypal-capture', { order_id: token, ref })
      .then(r => { setResult(r.data); setLoading(false); })
      .catch(e => { setError(e.response?.data?.detail || 'error'); setLoading(false); });
  }, [ref, token]);

  const lang = result?.lang || 'en';
  const t = T[lang] || T.en;

  if (loading) return (
    <div style={s.page}><div style={s.card}><p style={s.center}>{T.en.processing}</p></div></div>
  );

  if (error) return (
    <div style={s.page}><div style={s.card}>
      <div style={{ ...s.hdr, background: '#c0392b' }}>
        <div style={s.icon}>✕</div>
        <h1 style={s.h1}>Sjölyckan</h1>
      </div>
      <p style={{ ...s.center, color: '#c0392b', marginTop: 24 }}>{t.error}</p>
      <p style={{ ...s.center, color: '#aaa', fontSize: 13 }}>{ref}</p>
    </div></div>
  );

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ ...s.hdr, background: '#27ae60' }}>
          <div style={s.icon}>✓</div>
          <h1 style={s.h1}>{t.title}</h1>
        </div>
        <h2 style={s.thankYou}>{t.thank_you}</h2>
        <p style={s.msg}>{result.payment_type === 'deposit' ? t.deposit_msg : t.final_msg}</p>
        <div style={s.summaryBox}>
          <div style={s.row}><span>{t.ref}</span><strong>{result.booking_ref}</strong></div>
          <div style={s.row}><span>{t.amount}</span><strong>{fmtSEK(result.amount)}</strong></div>
        </div>
        <p style={s.contact}>{t.contact} <a href="mailto:rolsmo23.36297@gmail.com" style={{ color: '#1a5276' }}>rolsmo23.36297@gmail.com</a></p>
      </div>
    </div>
  );
}

const s = {
  page:      { minHeight: '100vh', background: '#f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial,sans-serif' },
  card:      { background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: 32, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' },
  hdr:       { color: '#fff', borderRadius: 8, padding: '20px 24px', textAlign: 'center', marginBottom: 24 },
  icon:      { fontSize: 36, marginBottom: 6 },
  h1:        { margin: 0, fontSize: 22, fontWeight: 700 },
  thankYou:  { fontSize: 18, fontWeight: 600, color: '#333', marginBottom: 8 },
  msg:       { fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 20 },
  summaryBox:{ background: '#f8f6f1', borderRadius: 8, padding: '14px 16px', marginBottom: 20 },
  row:       { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#444', marginBottom: 8 },
  center:    { textAlign: 'center', color: '#666' },
  contact:   { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 16 },
};
