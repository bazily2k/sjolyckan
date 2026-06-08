import { useState, useEffect, useRef } from "react";
import { useTranslation } from 'next-i18next';
import { bookingApi, publicApi } from '../../lib/api';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

// ─── Validering ─────────────────────────────────────────
const validators = {
  guest_name: (v) => v.trim().length < 2 ? 'Minst 2 tecken' : '',
  guest_email: (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Ogiltig e-postadress' : '',
  guest_phone: (v) => v && v.replace(/\D/g,'').length < 6 ? 'Ogiltigt telefonnummer' : '',
  address_line1: (v) => v.trim().length < 3 ? 'Ange gatuadress' : '',
  postal_code: (v, country) => {
    const digits = v.replace(/\D/g,'');
    if (country === 'SE' && digits.length !== 5) return 'Svenskt postnummer: 5 siffror';
    if (country === 'DE' && digits.length !== 5) return 'Deutsches PLZ: 5 Ziffern';
    if (country === 'NO' && digits.length !== 4) return 'Norsk postnummer: 4 siffer';
    if (country === 'DK' && digits.length !== 4) return 'Dansk postnummer: 4 cifre';
    if (digits.length < 3) return 'Ogiltigt postnummer';
    return '';
  },
  city: (v) => v.trim().length < 2 ? 'Ange ort' : '',
};

const COUNTRIES = [
  { code:'SE', label:'Sverige', postalLabel:'Postnummer', postalPlaceholder:'123 45', cityLabel:'Ort' },
  { code:'DE', label:'Deutschland', postalLabel:'Postleitzahl', postalPlaceholder:'12345', cityLabel:'Stadt' },
  { code:'NO', label:'Norge', postalLabel:'Postnummer', postalPlaceholder:'1234', cityLabel:'Sted' },
  { code:'DK', label:'Danmark', postalLabel:'Postnummer', postalPlaceholder:'1234', cityLabel:'By' },
  { code:'FI', label:'Finland', postalLabel:'Postinumero', postalPlaceholder:'12345', cityLabel:'Kaupunki' },
  { code:'GB', label:'United Kingdom', postalLabel:'Postcode', postalPlaceholder:'SW1A 1AA', cityLabel:'City' },
  { code:'NL', label:'Nederland', postalLabel:'Postcode', postalPlaceholder:'1234 AB', cityLabel:'Stad' },
  { code:'FR', label:'France', postalLabel:'Code postal', postalPlaceholder:'75001', cityLabel:'Ville' },
  { code:'OTHER', label:'Annat land', postalLabel:'Postnummer', postalPlaceholder:'', cityLabel:'Ort' },
];

const LABELS = {
  sv: {
    name:'Fullständigt namn', email:'E-postadress', phone:'Telefon',
    country:'Land', address:'Gatuadress', address2:'C/o, lägenhetsnr (valfritt)',
    message:'Meddelande (valfritt)', message_ph:'Eventuella önskemål eller frågor',
    submit:'Skicka bokningsförfrågan', back:'←',
    adults:'Antal vuxna', children:'Antal barn',
    child_age_ph:'År', add_child:'+ Lägg till barn', remove_child:'Ta bort',
    pets:'Husdjur', dogs:'Antal hundar', cats:'Antal katter',
    pets_note:'Husdjur är välkomna — vi ber dig ange antal för planering.',
    guests_section:'Gästinformation', contact_section:'Kontaktuppgifter',
    prefilled_note:'Dina sparade uppgifter är förifyllda — kontrollera och ändra vid behov.',
  },
  en: {
    name:'Full name', email:'Email address', phone:'Phone number',
    country:'Country', address:'Street address', address2:'Apt, suite, etc. (optional)',
    message:'Message (optional)', message_ph:'Any requests or questions',
    submit:'Send booking request', back:'←',
    adults:'Number of adults', children:'Number of children',
    child_age_ph:'Years', add_child:'+ Add child', remove_child:'Remove',
    pets:'Pets', dogs:'Number of dogs', cats:'Number of cats',
    pets_note:'Pets are welcome — please let us know how many for planning purposes.',
    guests_section:'Guest information', contact_section:'Contact details',
    prefilled_note:'Your saved details are pre-filled — please check and update if needed.',
  },
  de: {
    name:'Vollständiger Name', email:'E-Mail-Adresse', phone:'Telefonnummer',
    country:'Land', address:'Straße und Hausnummer', address2:'Adresszusatz (optional)',
    message:'Nachricht (optional)', message_ph:'Wünsche oder Fragen',
    submit:'Buchungsanfrage senden', back:'←',
    adults:'Anzahl Erwachsene', children:'Anzahl Kinder',
    child_age_ph:'Jahre', add_child:'+ Kind hinzufügen', remove_child:'Entfernen',
    pets:'Haustiere', dogs:'Anzahl Hunde', cats:'Anzahl Katzen',
    pets_note:'Haustiere sind willkommen — bitte Anzahl für die Planung angeben.',
    guests_section:'Gästeinformationen', contact_section:'Kontaktdaten',
    prefilled_note:'Ihre gespeicherten Daten sind vorausgefüllt — bitte prüfen und ggf. aktualisieren.',
  },
};

export default function BookingSidebar({ articles, initialCheckIn = '', initialCheckOut = '' }) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const lang = router.locale || 'sv';
  const L = LABELS[lang] || LABELS.sv;
  const { user } = useAuth();
  const sidebarRef = useRef(null);

  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(2);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [articleQuantities, setArticleQuantities] = useState({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [termsText, setTermsText] = useState('');
  const [gdprText, setGdprText] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [showGdpr, setShowGdpr] = useState(false);
  const [houseRulesAccepted, setHouseRulesAccepted] = useState(false);
  const [houseRulesText, setHouseRulesText] = useState('');
  const [showHouseRules, setShowHouseRules] = useState(false);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('dates');
  const [booking, setBooking] = useState(null);
  const [prefilled, setPrefilled] = useState(false);
  const [bookedDates, setBookedDates] = useState(new Set());
  const bookedDatesRef = useRef(new Set()) // eslint-disable-line
  const [dateError, setDateError] = useState('');

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState([]);
  const [dogs, setDogs] = useState(0);
  const [cats, setCats] = useState(0);

  const [form, setForm] = useState({
    guest_name:'', guest_email:'', guest_phone:'',
    guest_country:'SE', address_line1:'', address_line2:'',
    postal_code:'', city:'', message:'',
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Hämta bokade datum för validering
  useEffect(() => {
    const fetchBooked = async () => {
      const today = new Date();
      const months = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }
      try {
        const results = await Promise.all(
          months.map(({ year, month }) =>
            publicApi.availability(year, month).catch(() => ({ data: { days: [] } }))
          )
        );
        const booked = new Set();
        results.forEach(r => {
          (r.data.days || []).forEach(d => {
            if (d.status === 'booked' || d.status === 'pending') {
              booked.add(d.date);
            }
          });
        });
        setBookedDates(booked);
        bookedDatesRef.current = booked;
        console.log("Bokade datum:", booked.size, [...booked].slice(0,5));
      } catch(e) {}
    };
    fetchBooked();
  }, []);

  const validateDateRange = (ci, co) => {
    if (!ci || !co) return '';
    const from = new Date(ci);
    const to = new Date(co);
    const days = Math.round((to - from) / (1000 * 60 * 60 * 24));
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      if (bookedDatesRef.current.has(ds)) {
        return lang === 'de' ? 'Ausgewählte Daten nicht verfügbar. Bitte andere Daten wählen.' :
               lang === 'en' ? 'Selected dates are not available. Please choose different dates.' :
               'Valda datum är inte tillgängliga. Välj andra datum.';
      }
    }
    return '';
  };

  // Förifyll från inloggad användares profil
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const d = r.data;
        const name = [d.first_name, d.last_name].filter(Boolean).join(' ');
        setForm(f => ({
          ...f,
          guest_name: name || f.guest_name,
          guest_email: d.email || f.guest_email,
          guest_phone: d.phone || f.guest_phone,
          guest_country: d.country || f.guest_country,
          address_line1: d.address_line1 || f.address_line1,
          address_line2: d.address_line2 || f.address_line2,
          postal_code: d.postal_code || f.postal_code,
          city: d.city || f.city,
        }));
        if (name || d.phone || d.address_line1) setPrefilled(true);
      }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (initialCheckIn) setCheckIn(initialCheckIn);
    if (initialCheckOut) setCheckOut(initialCheckOut);
    if (initialCheckIn && initialCheckOut) {
      setDateError(validateDateRange(initialCheckIn, initialCheckOut));
    }
  }, [initialCheckIn, initialCheckOut, bookedDates]);

  useEffect(() => {
    setGuests(adults + children.length);
  }, [adults, children]);

  useEffect(() => {
    if (!checkIn || !checkOut) { setPrice(null); return; }
    const timer = setTimeout(() => {
      bookingApi.priceCheck({ date_from:checkIn, date_to:checkOut, guests_count:guests, article_ids:selectedArticles, article_quantities:articleQuantities, guest_email:form.guest_email||user?.email||undefined, lang })
        .then(r => { setPrice(r.data); setDateError(validateDateRange(checkIn, checkOut)); })
        .catch(e => {
          setPrice(null);
          const msg = e.response?.data?.detail;
          if (msg) setDateError(msg);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [checkIn, checkOut, guests, selectedArticles, articleQuantities]);

  // Scrolla till sidebaren när bekräftelsen visas
  useEffect(() => {
    if (step === 'confirm' && sidebarRef.current) {
      sidebarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [step]);


  useEffect(() => {
    if (!lang) return;
    const params = new URLSearchParams({ lang });
    if (price) {
      if (price.deposit_pct) params.set('deposit_pct', price.deposit_pct);
      if (price.deposit_days) params.set('deposit_days', price.deposit_days);
      if (price.payment_days_before) params.set('payment_days_before', price.payment_days_before);
    }
    if (checkIn) params.set('date_from', checkIn);
    if (guests) params.set('max_guests', guests);
    fetch(`/api/public/terms?${params}`)
      .then(r => r.json())
      .then(d => {
        setTermsText(d.terms_text || '');
        setGdprText(d.gdpr_text || '');
        setHouseRulesText(d.house_rules_text || '');
      }).catch(() => {});
  }, [lang, price]);

  const toggleArticle = (id, priceType) => {
    setSelectedArticles(prev => {
      if (prev.includes(id)) {
        setArticleQuantities(q => { const n = {...q}; delete n[id]; return n; });
        return prev.filter(x => x !== id);
      }
      if (priceType === 'per_occasion') {
        setArticleQuantities(q => ({ ...q, [id]: 1 }));
      }
      return [...prev, id];
    });
  };
  const setQty = (id, qty) => {
    const n = Math.max(1, parseInt(qty) || 1);
    setArticleQuantities(q => ({ ...q, [id]: n }));
  };

  const addChild = () => setChildren(c => [...c, '']);
  const removeChild = (i) => setChildren(c => c.filter((_,idx) => idx !== i));
  const setChildAge = (i, age) => setChildren(c => c.map((a,idx) => idx===i ? age : a));

  const validateField = (field, value) => {
    if (validators[field]) return validators[field](value, form.guest_country);
    return '';
  };

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]:value }));
    if (touched[field]) setErrors(e => ({ ...e, [field]:validateField(field, value) }));
  };

  const handleBlur = (field) => {
    setTouched(t => ({ ...t, [field]:true }));
    setErrors(e => ({ ...e, [field]:validateField(field, form[field]) }));
  };

  const validateAll = () => {
    const required = ['guest_name','guest_email','address_line1','postal_code','city'];
    const newErrors = {};
    let valid = true;
    required.forEach(field => {
      const err = validateField(field, form[field]);
      if (err) { newErrors[field] = err; valid = false; }
    });
    setErrors(newErrors);
    setTouched(Object.fromEntries(required.map(f => [f, true])));
    return valid;
  };

  const submit = async () => {
    if (!validateAll()) return;
    setLoading(true);
    try {
      const childrenInfo = children.map((age, i) => `Barn ${i+1}: ${age || '?'} år`).join(', ');
      const petsInfo = [
        dogs > 0 ? `${dogs} hund${dogs>1?'ar':''}` : '',
        cats > 0 ? `${cats} katt${cats>1?'er':''}` : '',
      ].filter(Boolean).join(', ');
      const guestDetails = [
        `Vuxna: ${adults}`,
        children.length > 0 ? `Barn: ${children.length} (${childrenInfo})` : '',
        petsInfo ? `Husdjur: ${petsInfo}` : '',
      ].filter(Boolean).join('\n');
      const fullMessage = [guestDetails, form.message].filter(Boolean).join('\n\n');

      const res = await bookingApi.request({
        guest_name: form.guest_name,
        guest_email: form.guest_email,
        guest_phone: form.guest_phone,
        guest_country: form.guest_country,
        guest_address: `${form.address_line1}${form.address_line2?', '+form.address_line2:''}, ${form.postal_code} ${form.city}`,
        message: fullMessage,
        date_from: checkIn,
        date_to: checkOut,
        guests_count: guests,
        article_ids: selectedArticles,
        article_quantities: articleQuantities,
        terms_accepted: termsAccepted,
        gdpr_accepted: gdprAccepted,
        house_rules_accepted: houseRulesAccepted,
        lang,
      });
      setBooking(res.data);
      setStep('confirm');
    } catch(e) {
      setErrors({ submit: e.response?.data?.detail || 'Ett fel uppstod. Försök igen.' });
    } finally {
      setLoading(false);
    }
  };

  const currentCountry = COUNTRIES.find(c => c.code === form.guest_country) || COUNTRIES[0];

  if (step === 'confirm' && booking) {
    return (
      <div style={card}>
        <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>✓</div>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, marginBottom:4 }}>{t('confirm.title')}</h3>
          <p style={{ fontSize:13, color:'var(--ink-light)' }}>{t('confirm.subtitle')}</p>
        </div>
        <div style={{ background:'var(--water-pale)', borderRadius:'var(--radius-md)', padding:16, fontSize:13 }}>
          <div style={infoRow}><span>{t('confirm.ref')}</span><strong>{booking.booking_ref}</strong></div>
          <div style={infoRow}><span>{t('confirm.total')}</span><strong>{booking.total_amount?.toLocaleString('sv-SE')} kr</strong></div>
          <div style={infoRow}><span>{t('confirm.deposit')}</span><strong>{booking.deposit_amount?.toLocaleString('sv-SE')} kr</strong></div>
          <div style={infoRow}><span>{t('confirm.deposit_due')}</span><strong>{booking.deposit_due_date}</strong></div>
        </div>
        <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'12px 14px', fontSize:12.5, color:'var(--ink-light)', marginTop:12, lineHeight:1.5 }}>
          ✉️ {lang==='de'
            ? 'Falls Sie noch kein Konto haben, haben wir eines für Sie erstellt. Bitte prüfen Sie Ihre E-Mail, um Ihr Passwort festzulegen und Ihre Buchung zu verfolgen.'
            : lang==='en'
            ? "If you don't already have an account, we've created one for you. Please check your email to set your password and follow your booking."
            : 'Om du inte redan har ett konto har vi skapat ett åt dig. Kolla din e-post för att sätta ditt lösenord och följa din bokning.'}
        </div>
      </div>
    );
  }

  return (
    <div ref={sidebarRef} style={card}>
      <div style={{ marginBottom:16 }}>
        {price ? (
          <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
            <span style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:500 }}>
              {Math.round(price.base_amount/price.nights).toLocaleString('sv-SE')} kr
            </span>
            <span style={{ fontSize:13, color:'var(--ink-pale)' }}>{t('booking.per_night')}</span>
          </div>
        ) : (
          <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:'var(--ink-pale)' }}>Sjölyckan</div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        <div style={dateBox}>
          <div style={dateLabel}>{t('booking.checkin')}</div>
          <input type="date" value={checkIn} onChange={e => { setCheckIn(e.target.value); setDateError(validateDateRange(e.target.value, checkOut)); }}
            style={dateInput} min={new Date().toISOString().split('T')[0]} />
        </div>
        <div style={dateBox}>
          <div style={dateLabel}>{t('booking.checkout')}</div>
          <input type="date" value={checkOut} onChange={e => { setCheckOut(e.target.value); setDateError(validateDateRange(checkIn, e.target.value)); }}
            style={dateInput} min={checkIn||new Date().toISOString().split('T')[0]} />
        </div>
      </div>

      {articles?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>
            {t('booking.addons')}
          </div>
          {articles.map(a => (
            <div key={a.id} style={{ marginBottom:4 }}>
              <div onClick={() => a.bookable && toggleArticle(a.id, a.price_type)} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'7px 10px',
                border:`1px solid ${selectedArticles.includes(a.id)?'var(--water)':'var(--sand-dark)'}`,
                borderRadius:'var(--radius-md)', cursor:a.bookable?'pointer':'default',
                background:selectedArticles.includes(a.id)?'var(--water-pale)':'white',
              }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{a.name}</div>
                  <div style={{ fontSize:11, color:'var(--ink-pale)' }}>{a.desc}</div>
                </div>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--water)', whiteSpace:'nowrap', marginLeft:8 }}>
                  {a.price} kr {a.price_type==='per_night'?t('booking.per_night'):a.price_type==='per_guest'?t('booking.per_guest'):a.price_type==='per_occasion'?(lang==='de'?'/ Mal':lang==='en'?'/ occasion':'/ tillfälle'):''}
                </div>
              </div>
              {a.price_type === 'per_occasion' && selectedArticles.includes(a.id) && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--water-pale)', borderRadius:'0 0 var(--radius-md) var(--radius-md)', borderTop:'none' }}>
                  <span style={{ fontSize:12, color:'var(--ink-pale)' }}>{lang==='de'?'Anzahl':lang==='en'?'Occasions':lang==='sv'?'Antal tillfällen':''}: </span>
                  <button onClick={e => { e.stopPropagation(); setQty(a.id, (articleQuantities[a.id]||1)-1); }} style={{ width:24, height:24, border:'1px solid var(--water)', borderRadius:4, background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                  <span style={{ fontSize:13, fontWeight:600, minWidth:20, textAlign:'center' }}>{articleQuantities[a.id]||1}</span>
                  <button onClick={e => { e.stopPropagation(); setQty(a.id, (articleQuantities[a.id]||1)+1); }} style={{ width:24, height:24, border:'1px solid var(--water)', borderRadius:4, background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                  <span style={{ fontSize:12, color:'var(--ink-pale)', marginLeft:4 }}>{((articleQuantities[a.id]||1) * a.price).toLocaleString('sv-SE')} kr</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {price && (
        <div style={{ borderTop:'1px solid var(--sand-dark)', paddingTop:10, marginBottom:12, fontSize:13 }}>
          <div style={priceRow}>
            <span>{Math.round(price.base_amount/price.nights).toLocaleString('sv-SE')} kr × {price.nights} {price.nights===1?t('booking.night'):t('booking.nights')}</span>
            <span>{price.base_amount?.toLocaleString('sv-SE')} kr</span>
          </div>
          {price.extra_guest_fee > 0 && (
            <div style={{ ...priceRow, alignItems:'flex-start' }}>
              <span style={{ flex:1, minWidth:0 }}>
                {lang==='de'?'Zusatzgebühr Gäste':lang==='en'?'Extra guest fee':'Extra gästavgift'}
                <span style={{ display:'block', fontSize:11, color:'var(--ink-pale)', marginTop:2 }}>
                  {lang==='de'
                    ? `${price.extra_guests} Gäste über ${price.extra_guest_threshold} · ${price.extra_guest_rate?.toLocaleString('sv-SE')} kr/Gast/Nacht`
                    : lang==='en'
                    ? `${price.extra_guests} guest(s) above ${price.extra_guest_threshold} · ${price.extra_guest_rate?.toLocaleString('sv-SE')} kr/guest/night`
                    : `${price.extra_guests} gäst(er) över ${price.extra_guest_threshold} · ${price.extra_guest_rate?.toLocaleString('sv-SE')} kr/gäst/natt`}
                </span>
              </span>
              <span style={{ whiteSpace:'nowrap', marginLeft:8, flexShrink:0 }}>{price.extra_guest_fee?.toLocaleString('sv-SE')} kr</span>
            </div>
          )}
          {price.articles?.filter(a => !a.is_deposit).map(a => (
            <div key={a.article_id} style={priceRow}>
              <span>{(lang==='de'?a.name_de:lang==='en'?a.name_en:a.name_sv)}{a.quantity > 1 ? ` ×${a.quantity}` : ''}</span>
              <span>{a.line_total?.toLocaleString('sv-SE')} kr</span>
            </div>
          ))}
          {price.discount_amount > 0 && (
            <div style={{ ...priceRow, color:'var(--forest)' }}>
              <span>{lang==='de'?'Rabatt':lang==='en'?'Discount':'Rabatt'} ({price.discount_pct}%)</span>
              <span>−{price.discount_amount?.toLocaleString('sv-SE')} kr</span>
            </div>
          )}
          {price.articles?.filter(a => a.is_deposit).map(a => (
            <div key={a.article_id} style={{ ...priceRow, alignItems:'flex-start' }}>
              <span style={{ flex:1, minWidth:0 }}>
                {(lang==='de'?a.name_de:lang==='en'?a.name_en:a.name_sv)}
                {(lang==='de'?a.desc_de:lang==='en'?a.desc_en:a.desc_sv) ? (
                  <span style={{ display:'block', color:'var(--ink-pale)', fontSize:11, marginTop:2 }}>{(lang==='de'?a.desc_de:lang==='en'?a.desc_en:a.desc_sv)}</span>
                ) : null}
              </span>
              <span style={{ whiteSpace:'nowrap', marginLeft:8, flexShrink:0 }}>{a.line_total?.toLocaleString('sv-SE')} kr</span>
            </div>
          ))}
          <div style={{ ...priceRow, fontWeight:600, borderTop:'1px solid var(--sand-dark)', paddingTop:6, marginTop:4 }}>
            <span>{t('booking.total')}</span><span>{price.total_amount?.toLocaleString('sv-SE')} kr</span>
          </div>
          <div style={{ ...priceRow, color:'var(--water)', fontSize:12 }}>
            <span>{t('booking.deposit')} ({price.deposit_pct}%)</span>
            <span>{price.deposit_amount?.toLocaleString('sv-SE')} kr</span>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div style={{ marginBottom:12 }}>

          {/* Gästinformation */}
          <div style={{ fontSize:12, fontWeight:600, color:'var(--water)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, paddingBottom:6, borderBottom:'1px solid var(--sand-dark)' }}>
            {L.guests_section}
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:13, color:'var(--ink-light)' }}>{L.adults}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={() => setAdults(a => Math.max(1,a-1))} style={guestBtn}>−</button>
              <span style={{ fontSize:14, fontWeight:500, minWidth:20, textAlign:'center' }}>{adults}</span>
              <button onClick={() => setAdults(a => Math.min(8,a+1))} style={guestBtn}>+</button>
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:13, color:'var(--ink-light)' }}>{L.children}</span>
              <button onClick={addChild} disabled={adults+children.length>=8} style={{
                fontSize:12, color:'var(--water)', background:'none', border:'1px solid var(--water)',
                borderRadius:'var(--radius-md)', padding:'3px 10px', cursor:'pointer',
              }}>{L.add_child}</button>
            </div>
            {children.map((age, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:13, color:'var(--ink-light)', minWidth:60 }}>
                  {lang==='de'?'Kind':'Child'} {i+1}
                </span>
                <input type="number" min="0" max="17" value={age}
                  onChange={e => setChildAge(i, e.target.value)}
                  placeholder={L.child_age_ph}
                  style={{ ...inp, width:80, textAlign:'center' }} />
                <span style={{ fontSize:12, color:'var(--ink-pale)' }}>{L.child_age_ph}</span>
                <button onClick={() => removeChild(i)} style={{ fontSize:11, color:'var(--red)', background:'none', border:'none', cursor:'pointer' }}>
                  {L.remove_child}
                </button>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 12px', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--ink-light)', marginBottom:8 }}>{L.pets}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:6 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--ink-pale)', display:'block', marginBottom:3 }}>{L.dogs} 🐕</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setDogs(d => Math.max(0,d-1))} style={smallBtn}>−</button>
                  <span style={{ fontSize:13, fontWeight:500, minWidth:16, textAlign:'center' }}>{dogs}</span>
                  <button onClick={() => setDogs(d => Math.min(4,d+1))} style={smallBtn}>+</button>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--ink-pale)', display:'block', marginBottom:3 }}>{L.cats} 🐈</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setCats(c => Math.max(0,c-1))} style={smallBtn}>−</button>
                  <span style={{ fontSize:13, fontWeight:500, minWidth:16, textAlign:'center' }}>{cats}</span>
                  <button onClick={() => setCats(c => Math.min(4,c+1))} style={smallBtn}>+</button>
                </div>
              </div>
            </div>
            <p style={{ fontSize:11, color:'var(--ink-pale)', margin:0 }}>{L.pets_note}</p>
          </div>

          {/* Kontaktuppgifter */}
          <div style={{ fontSize:12, fontWeight:600, color:'var(--water)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, paddingBottom:6, borderBottom:'1px solid var(--sand-dark)' }}>
            {L.contact_section}
          </div>

          {prefilled && (
            <div style={{ background:'#e8f4f8', borderRadius:'var(--radius-md)', padding:'8px 12px', fontSize:12, color:'var(--ink-light)', marginBottom:10 }}>
              ℹ️ {L.prefilled_note}
            </div>
          )}

          <Field label={L.name} error={errors.guest_name} required>
            <input value={form.guest_name} onChange={e => handleChange('guest_name',e.target.value)} onBlur={() => handleBlur('guest_name')}
              style={{ ...inp, borderColor:errors.guest_name&&touched.guest_name?'var(--red)':'var(--sand-dark)' }} />
          </Field>

          <Field label={L.email} error={touched.guest_email&&errors.guest_email} required>
            <input type="email" value={form.guest_email} onChange={e => handleChange('guest_email',e.target.value)} onBlur={() => handleBlur('guest_email')}
              style={{ ...inp, borderColor:errors.guest_email&&touched.guest_email?'var(--red)':'var(--sand-dark)' }} />
          </Field>

          <Field label={L.phone} error={touched.guest_phone&&errors.guest_phone}>
            <input type="tel" value={form.guest_phone} onChange={e => handleChange('guest_phone',e.target.value)} onBlur={() => handleBlur('guest_phone')} style={inp} />
          </Field>

          <Field label={L.country} required>
            <select value={form.guest_country} onChange={e => { handleChange('guest_country',e.target.value); setErrors(er=>({...er,postal_code:''})); }} style={inp}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>

          <Field label={L.address} error={touched.address_line1&&errors.address_line1} required>
            <input value={form.address_line1} onChange={e => handleChange('address_line1',e.target.value)} onBlur={() => handleBlur('address_line1')}
              style={{ ...inp, borderColor:errors.address_line1&&touched.address_line1?'var(--red)':'var(--sand-dark)' }} />
          </Field>

          <Field label={L.address2}>
            <input value={form.address_line2} onChange={e => handleChange('address_line2',e.target.value)} style={inp} />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 3fr', gap:8 }}>
            <Field label={currentCountry.postalLabel} error={touched.postal_code&&errors.postal_code} required>
              <input value={form.postal_code} onChange={e => handleChange('postal_code',e.target.value)} onBlur={() => handleBlur('postal_code')}
                placeholder={currentCountry.postalPlaceholder}
                style={{ ...inp, borderColor:errors.postal_code&&touched.postal_code?'var(--red)':'var(--sand-dark)' }} />
            </Field>
            <Field label={currentCountry.cityLabel} error={touched.city&&errors.city} required>
              <input value={form.city} onChange={e => handleChange('city',e.target.value)} onBlur={() => handleBlur('city')}
                style={{ ...inp, borderColor:errors.city&&touched.city?'var(--red)':'var(--sand-dark)' }} />
            </Field>
          </div>

          <Field label={L.message}>
            <textarea value={form.message} onChange={e => handleChange('message',e.target.value)}
              placeholder={L.message_ph} style={{ ...inp, height:60, resize:'vertical' }} />
          </Field>

          {errors.submit && (
            <div style={{ background:'#fce8e8', color:'var(--red)', padding:'8px 12px', borderRadius:'var(--radius-md)', fontSize:13, marginBottom:8 }}>
              {errors.submit}
            </div>
          )}
        </div>
      )}

      {dateError && (
        <div style={{ background:'#fce8e8', color:'var(--red)', padding:'8px 12px', borderRadius:'var(--radius-md)', fontSize:13, marginBottom:8 }}>
          ⚠️ {dateError}
        </div>
      )}

      {step === 'dates' ? (
        <button onClick={() => { if(!checkIn||!checkOut||dateError) return; setStep('form'); }} disabled={!checkIn||!checkOut||!!dateError}
          style={{ ...bookBtn, opacity:!checkIn||!checkOut?0.5:1, cursor:!checkIn||!checkOut?'not-allowed':'pointer' }}>
          {t('booking.book_now')}
        </button>
      ) : (
        <>
          {/* Villkor och GDPR */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--ink)', marginBottom:8, cursor:'pointer' }}>
              <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop:2, flexShrink:0 }} />
              <span>
                {lang==='sv'?'Jag godkänner ':lang==='de'?'Ich akzeptiere die ':'I accept the '}
                <button type="button" onClick={() => setShowTerms(!showTerms)} style={{ background:'none', border:'none', color:'var(--water)', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline' }}>
                  {lang==='sv'?'bokningsvillkoren':lang==='de'?'Buchungsbedingungen':'booking terms'}
                </button>
              </span>
            </label>
            {showTerms && termsText && (
              <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 12px', fontSize:11, color:'var(--ink-light)', marginBottom:8, maxHeight:150, overflowY:'auto' }}
                className="ql-content"
                dangerouslySetInnerHTML={{ __html: termsText }} />
            )}
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--ink)', cursor:'pointer' }}>
              <input type="checkbox" checked={gdprAccepted} onChange={e => setGdprAccepted(e.target.checked)} style={{ marginTop:2, flexShrink:0 }} />
              <span>
                {lang==='sv'?'Jag godkänner ':lang==='de'?'Ich stimme der ':'I accept the '}
                <button type="button" onClick={() => setShowGdpr(!showGdpr)} style={{ background:'none', border:'none', color:'var(--water)', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline' }}>
                  {lang==='sv'?'hanteringen av personuppgifter':lang==='de'?'Datenschutzerklärung zu':'privacy policy'}
                </button>
              </span>
            </label>
            {showGdpr && gdprText && (
              <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 12px', fontSize:11, color:'var(--ink-light)', marginTop:8, maxHeight:150, overflowY:'auto' }}
                className="ql-content"
                dangerouslySetInnerHTML={{ __html: gdprText }} />
            )}
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--ink)', cursor:'pointer', marginTop:8 }}>
              <input type="checkbox" checked={houseRulesAccepted} onChange={e => setHouseRulesAccepted(e.target.checked)} style={{ marginTop:2, flexShrink:0 }} />
              <span>
                {lang==='sv'?'Jag godkänner ':lang==='de'?'Ich akzeptiere die ':'I accept the '}
                <button type="button" onClick={() => setShowHouseRules(!showHouseRules)} style={{ background:'none', border:'none', color:'var(--water)', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline' }}>
                  {lang==='sv'?'husreglerna':lang==='de'?'Hausregeln':'house rules'}
                </button>
              </span>
            </label>
            {showHouseRules && houseRulesText && (
              <div style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 12px', fontSize:11, color:'var(--ink-light)', marginTop:8, maxHeight:150, overflowY:'auto' }}
                className="ql-content"
                dangerouslySetInnerHTML={{ __html: houseRulesText }} />
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setStep('dates')} style={{ ...bookBtn, background:'var(--sand)', color:'var(--ink)', flex:1 }}>
              {L.back}
            </button>
            {(!termsAccepted || !gdprAccepted || !houseRulesAccepted) && (
              <div style={{ fontSize:12, color:'var(--red)', marginBottom:8, padding:'8px 10px', background:'#fdf3f3', borderRadius:'var(--radius-md)', border:'1px solid #f5c6cb' }}>
                {lang==='de' ? 'Bitte stimmen Sie allen Bedingungen zu, bevor Sie die Anfrage senden.'
                  : lang==='en' ? 'Accept all terms and conditions to send the booking request.'
                  : 'Acceptera samtliga villkor för att kunna skicka Bokningsförfrågan.'}
              </div>
            )}
            <button onClick={submit} disabled={loading || !termsAccepted || !gdprAccepted || !houseRulesAccepted} style={{ ...bookBtn, flex:3, opacity:(loading||!termsAccepted||!gdprAccepted||!houseRulesAccepted)?0.7:1 }}>
              {loading?'...':L.submit}
            </button>
          </div>
        </>
      )}

      {!checkIn && !checkOut && (
        <p style={{ textAlign:'center', fontSize:12, color:'var(--ink-pale)', marginTop:8 }}>
          {t('booking.select_dates')}
        </p>
      )}
    </div>
  );
}

function Field({ label, error, required, children }) {
  return (
    <div style={{ marginBottom:8 }}>
      <label style={{ fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', display:'block', marginBottom:3 }}>
        {label}{required && <span style={{ color:'var(--red)', marginLeft:2 }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{error}</div>}
    </div>
  );
}

const card = { background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', padding:20, boxShadow:'var(--shadow-md)', boxSizing:'border-box', width:'100%', maxWidth:'100%' };
const dateBox = { border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', padding:'8px 12px', display:'flex', flexDirection:'column' };
const dateLabel = { fontSize:10, fontWeight:600, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 };
const dateInput = { border:'none', background:'transparent', fontSize:13, color:'var(--ink)', outline:'none', cursor:'pointer', width:'100%' };
const guestBtn = { width:26, height:26, border:'1px solid var(--sand-dark)', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' };
const smallBtn = { width:22, height:22, border:'1px solid var(--sand-dark)', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' };
const priceRow = { display:'flex', justifyContent:'space-between', padding:'2px 0', color:'var(--ink-light)' };
const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', color:'var(--ink)', background:'white', boxSizing:'border-box' };
const bookBtn = { width:'100%', padding:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', fontSize:14, fontWeight:500, cursor:'pointer' };
const infoRow = { display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13 };
