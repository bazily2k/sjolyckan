import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function AddonPage() {
  const router = useRouter();
  const { ref } = router.query;

  const [step, setStep] = useState('lookup'); // lookup | select | confirm | done
  const [bookingRef, setBookingRef] = useState(ref || '');
  const [booking, setBooking] = useState(null);
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState({});    // {article_id: qty}
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const lang = booking?.lang || 'sv';

  const L = {
    sv: { title:'Komplettera bokning', lookup_title:'Ange bokningsnummer', lookup_btn:'Hämta bokning', ref_label:'Bokningsnummer', select_title:'Välj tillägg', qty:'Antal', message_label:'Meddelande (valfritt)', message_placeholder:'T.ex. vi tar med hunden', submit:'Skicka tilläggsbegäran', done_title:'Tilläggsbegäran skickad!', done_text:'Vi bekräftar din begäran via e-post.', back:'Tillbaka', per_night:'/ natt', per_guest:'/ gäst', fixed:'fast pris', per_pet:'/ husdjur', per_occasion:'/ tillfälle', total:'Totalt', night:'natt', nights:'nätter' },
    en: { title:'Add to booking', lookup_title:'Enter booking reference', lookup_btn:'Find booking', ref_label:'Booking reference', select_title:'Select add-ons', qty:'Qty', message_label:'Message (optional)', message_placeholder:'E.g. we are bringing our dog', submit:'Send add-on request', done_title:'Add-on request sent!', done_text:'We will confirm your request by email.', back:'Back', per_night:'/ night', per_guest:'/ guest', fixed:'fixed', per_pet:'/ pet', per_occasion:'/ occasion', total:'Total', night:'night', nights:'nights' },
    de: { title:'Buchung ergänzen', lookup_title:'Buchungsnummer eingeben', lookup_btn:'Buchung abrufen', ref_label:'Buchungsnummer', select_title:'Zusätze wählen', qty:'Anz.', message_label:'Nachricht (optional)', message_placeholder:'Z.B. wir bringen unseren Hund mit', submit:'Zusatzanfrage senden', done_title:'Zusatzanfrage gesendet!', done_text:'Wir bestätigen Ihre Anfrage per E-Mail.', back:'Zurück', per_night:'/ Nacht', per_guest:'/ Gast', fixed:'Pauschale', per_pet:'/ Tier', per_occasion:'/ Mal', total:'Gesamt', night:'Nacht', nights:'Nächte' },
  };
  const t = L[lang] || L.sv;

  // Auto-lookup om ref finns i URL
  useEffect(() => {
    if (ref && step === 'lookup') lookupBooking(ref);
  }, [ref]);

  const lookupBooking = async (refStr) => {
    setLoading(true); setError('');
    try {
      const r = await axios.get(`${API}/public/booking-lookup?ref=${(refStr||bookingRef).trim().toUpperCase()}`);
      setBooking(r.data);
      const arts = await axios.get(`${API}/public/articles`);
      setArticles(arts.data.filter(a => a.bookable && !a.is_deposit && !a.is_pet_fee));
      setStep('select');
    } catch(e) {
      setError(e.response?.data?.detail || (lang==='en'?'Booking not found':'Bokning hittades inte'));
    } finally { setLoading(false); }
  };

  const totalAmount = () => {
    return articles.reduce((sum, a) => {
      const qty = selected[a.id] || 0;
      if (!qty) return sum;
      let price = a.price;
      if (a.price_type === 'per_night') price *= booking?.nights || 1;
      if (a.price_type === 'per_guest') price *= booking?.guests_count || 1;
      return sum + price * qty;
    }, 0);
  };

  const submit = async () => {
    const article_ids = Object.keys(selected).filter(k => selected[k] > 0).map(Number);
    if (!article_ids.length) { setError(lang==='en'?'Select at least one add-on':'Välj minst ett tillägg'); return; }
    setLoading(true); setError('');
    try {
      const r = await axios.post(`${API}/bookings/addon-request`, {
        booking_ref: booking.booking_ref,
        article_ids,
        article_quantities: selected,
        message,
      });
      setResult(r.data); setStep('done');
    } catch(e) {
      setError(e.response?.data?.detail || 'Ett fel uppstod');
    } finally { setLoading(false); }
  };

  const priceLabel = (a) => {
    if (a.price_type==='per_night') return `${a.price.toLocaleString('sv-SE')} kr ${t.per_night}`;
    if (a.price_type==='per_guest') return `${a.price.toLocaleString('sv-SE')} kr ${t.per_guest}`;
    if (a.price_type==='per_pet')   return `${a.price.toLocaleString('sv-SE')} kr ${t.per_pet}`;
    return `${a.price.toLocaleString('sv-SE')} kr`;
  };

  const card = { background:'white', borderRadius:16, border:'1px solid #e5e0d8', padding:'32px', maxWidth:520, margin:'60px auto', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' };
  const inp = { width:'100%', padding:'10px 12px', border:'1px solid #d4cfc8', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box' };
  const btn = { width:'100%', padding:'12px', background:'#2c5f8a', color:'white', border:'none', borderRadius:8, fontSize:15, fontWeight:500, cursor:'pointer', marginTop:16 };

  return (
    <>
      <Head><title>{t.title} — Sjölyckan</title></Head>
      <div style={{ minHeight:'100vh', background:'#f8f5f0', padding:'20px' }}>
        <div style={card}>
          {step === 'lookup' && (
            <>
              <h1 style={{ fontFamily:'Georgia,serif', fontSize:26, marginBottom:8 }}>Sjölyckan</h1>
              <h2 style={{ fontSize:18, fontWeight:500, marginBottom:24, color:'#555' }}>{t.lookup_title}</h2>
              {error && <div style={{ padding:'10px 14px', background:'#fdf3f3', border:'1px solid #f5c6cb', borderRadius:8, fontSize:13, marginBottom:16, color:'#721c24' }}>{error}</div>}
              <label style={{ fontSize:12, fontWeight:500, color:'#888', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>{t.ref_label}</label>
              <input value={bookingRef} onChange={e => setBookingRef(e.target.value.toUpperCase())}
                placeholder="SJO-2026-XXXX" style={inp}
                onKeyDown={e => e.key==='Enter' && lookupBooking(bookingRef)} />
              <button onClick={() => lookupBooking(bookingRef)} disabled={loading} style={btn}>
                {loading ? '...' : t.lookup_btn}
              </button>
            </>
          )}

          {step === 'select' && booking && (
            <>
              <div style={{ marginBottom:20, padding:'12px 16px', background:'#f0f7f0', borderRadius:8, border:'1px solid #c3e6c3' }}>
                <div style={{ fontSize:12, color:'#555', marginBottom:2 }}>Bokning / {booking.booking_ref}</div>
                <div style={{ fontWeight:500 }}>{booking.guest_name}</div>
                <div style={{ fontSize:13, color:'#666' }}>{booking.date_from} → {booking.date_to} · {booking.nights} {booking.nights===1?t.night:t.nights}</div>
              </div>
              <h2 style={{ fontSize:18, fontWeight:500, marginBottom:16 }}>{t.select_title}</h2>
              {error && <div style={{ padding:'10px 14px', background:'#fdf3f3', border:'1px solid #f5c6cb', borderRadius:8, fontSize:13, marginBottom:16, color:'#721c24' }}>{error}</div>}
              {articles.map(a => {
                const nameKey = `name_${lang}`;
                const name = a[nameKey] || a.name_sv || a.name;
                const qty = selected[a.id] || 0;
                return (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #ede9e4' }}>
                    <div>
                      <div style={{ fontWeight:500, fontSize:14 }}>{name}</div>
                      <div style={{ fontSize:12, color:'#888' }}>{priceLabel(a)}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={() => setSelected(p=>({...p,[a.id]:Math.max(0,(p[a.id]||0)-1)}))}
                        style={{ width:30, height:30, border:'1px solid #d4cfc8', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:16 }}>−</button>
                      <span style={{ width:24, textAlign:'center', fontSize:14 }}>{qty}</span>
                      <button onClick={() => setSelected(p=>({...p,[a.id]:(p[a.id]||0)+1}))}
                        style={{ width:30, height:30, border:'1px solid #d4cfc8', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:16 }}>+</button>
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop:16 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#888', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>{t.message_label}</label>
                <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder={t.message_placeholder}
                  rows={3} style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
              </div>
              {totalAmount() > 0 && (
                <div style={{ marginTop:16, padding:'12px 16px', background:'#f8f5f0', borderRadius:8, display:'flex', justifyContent:'space-between', fontWeight:500 }}>
                  <span>{t.total}</span>
                  <span>{totalAmount().toLocaleString('sv-SE')} kr</span>
                </div>
              )}
              <button onClick={submit} disabled={loading} style={btn}>
                {loading ? '...' : t.submit}
              </button>
              <button onClick={() => setStep('lookup')} style={{ ...btn, background:'transparent', color:'#888', border:'1px solid #d4cfc8', marginTop:8 }}>{t.back}</button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✓</div>
              <h2 style={{ fontSize:22, fontFamily:'Georgia,serif', marginBottom:12 }}>{t.done_title}</h2>
              <p style={{ color:'#666', fontSize:14 }}>{t.done_text}</p>
              {result && <p style={{ color:'#888', fontSize:13, marginTop:8 }}>Ref: {result.booking_ref} · {result.total_amount?.toLocaleString('sv-SE')} kr</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
