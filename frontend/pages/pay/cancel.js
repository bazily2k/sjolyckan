import { useRouter } from 'next/router';

const T = {
  sv: { title: 'Betalning avbruten', msg: 'Betalningen avbröts. Använd länken i ditt bekräftelsemail för att försöka igen.', btn: 'Försök igen' },
  en: { title: 'Payment cancelled', msg: 'Your payment was cancelled. Use the link in your confirmation email to try again.', btn: 'Try again' },
  de: { title: 'Zahlung abgebrochen', msg: 'Die Zahlung wurde abgebrochen. Verwenden Sie den Link in Ihrer Bestätigungs-E-Mail, um es erneut zu versuchen.', btn: 'Erneut versuchen' },
};

export default function PayCancel() {
  const router = useRouter();
  const { ref } = router.query;
  const t = T.en;

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.hdr}>
          <div style={s.icon}>✕</div>
          <h1 style={s.h1}>Sjölyckan</h1>
        </div>
        <h2 style={s.title}>{t.title}</h2>
        <p style={s.msg}>{t.msg}</p>
        {ref && (
          <button onClick={() => router.push(`/pay/${ref}`)} style={s.btn}>{t.btn}</button>
        )}
      </div>
    </div>
  );
}

const s = {
  page:  { minHeight: '100vh', background: '#f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial,sans-serif' },
  card:  { background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: 32, boxShadow: '0 2px 20px rgba(0,0,0,0.08)', textAlign: 'center' },
  hdr:   { background: '#c0392b', color: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 24 },
  icon:  { fontSize: 36, marginBottom: 6 },
  h1:    { margin: 0, fontSize: 22, fontWeight: 700 },
  title: { fontSize: 20, color: '#333', marginBottom: 12 },
  msg:   { fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 },
  btn:   { padding: '12px 28px', background: '#003087', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 },
};
