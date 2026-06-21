import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import PasswordField from '../components/common/PasswordField';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import Nav from '../components/common/Nav';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/api';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const STATUS_LABELS = {
  sv: {
    pending: 'Väntar på godkännande',
    confirmed: 'Bekräftad',
    deposit_paid: 'Handpenning betald',
    paid: 'Fullbetald',
    cancelled: 'Avbokad',
    expired: 'Förfallen',
  },
  en: {
    pending: 'Awaiting approval',
    confirmed: 'Confirmed',
    deposit_paid: 'Deposit paid',
    paid: 'Fully paid',
    cancelled: 'Cancelled',
    expired: 'Expired',
  },
  de: {
    pending: 'Wartet auf Bestätigung',
    confirmed: 'Bestätigt',
    deposit_paid: 'Anzahlung bezahlt',
    paid: 'Vollständig bezahlt',
    cancelled: 'Storniert',
    expired: 'Abgelaufen',
  },
};

const STATUS_COLORS = {
  pending: { bg: '#fef3cd', color: '#856404' },
  confirmed: { bg: '#d1ecf1', color: '#0c5460' },
  deposit_paid: { bg: '#d4edda', color: '#155724' },
  paid: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
  expired: { bg: '#e2e3e5', color: '#383d41' },
};

const PAGE_LABELS = {
  sv: {
    title: 'Min sida',
    profile: 'Mina uppgifter',
    bookings: 'Mina bokningar',
    no_bookings: 'Du har inga bokningar ännu.',
    save: 'Spara ändringar',
    saved: 'Sparat!',
    first_name: 'Förnamn',
    last_name: 'Efternamn',
    email: 'E-post',
    phone: 'Telefon',
    country: 'Land',
    address: 'Gatuadress',
    address2: 'C/o, lägenhetsnr (valfritt)',
    postal_code: 'Postnummer',
    city: 'Ort',
    password_section: 'Byt lösenord',
    current_password: 'Nuvarande lösenord',
    new_password: 'Nytt lösenord',
    confirm_password: 'Bekräfta nytt lösenord',
    change_password: 'Byt lösenord',
    password_mismatch: 'Lösenorden matchar inte',
    password_hint: 'Minst 10 tecken, blandning av bokstäver, siffror och specialtecken',
    booking_ref: 'Bokningsnummer',
    dates: 'Datum',
    nights: 'nätter',
    total: 'Totalt',
    deposit: 'Handpenning',
    deposit_due: 'Handpenning senast',
    payment_due: 'Slutbetalning senast',
    status: 'Status',
    addons: 'Tillägg',
    payment_method: 'Betalningssätt',
    swish_info: 'Swisha till',
    back: '← Tillbaka till startsidan',
    tab_profile: 'Mina uppgifter',
    tab_bookings: 'Bokningar',
  },
  en: {
    title: 'My page',
    profile: 'My details',
    bookings: 'My bookings',
    no_bookings: 'You have no bookings yet.',
    save: 'Save changes',
    saved: 'Saved!',
    first_name: 'First name',
    last_name: 'Last name',
    email: 'Email',
    phone: 'Phone',
    country: 'Country',
    address: 'Street address',
    address2: 'Apt, suite, etc. (optional)',
    postal_code: 'Postal code',
    city: 'City',
    password_section: 'Change password',
    current_password: 'Current password',
    new_password: 'New password',
    confirm_password: 'Confirm new password',
    change_password: 'Change password',
    password_mismatch: 'Passwords do not match',
    password_hint: 'At least 10 characters, mix of letters, numbers and special characters',
    booking_ref: 'Booking reference',
    dates: 'Dates',
    nights: 'nights',
    total: 'Total',
    deposit: 'Deposit',
    deposit_due: 'Deposit due by',
    payment_due: 'Final payment due',
    status: 'Status',
    addons: 'Add-ons',
    payment_method: 'Payment method',
    swish_info: 'Swish to',
    back: '← Back to home',
    tab_profile: 'My details',
    tab_bookings: 'Bookings',
  },
  de: {
    title: 'Mein Bereich',
    profile: 'Meine Daten',
    bookings: 'Meine Buchungen',
    no_bookings: 'Sie haben noch keine Buchungen.',
    save: 'Änderungen speichern',
    saved: 'Gespeichert!',
    first_name: 'Vorname',
    last_name: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    country: 'Land',
    address: 'Gatuadress',
    address2: 'C/o, lägenhetsnr (valfritt)',
    postal_code: 'Postnummer',
    city: 'Ort',
    password_section: 'Passwort ändern',
    current_password: 'Aktuelles Passwort',
    new_password: 'Neues Passwort',
    confirm_password: 'Neues Passwort bestätigen',
    change_password: 'Passwort ändern',
    password_mismatch: 'Passwörter stimmen nicht überein',
    password_hint: 'Mindestens 10 Zeichen, Kombination aus Buchstaben, Zahlen und Sonderzeichen',
    booking_ref: 'Buchungsnummer',
    dates: 'Datum',
    nights: 'Nächte',
    total: 'Gesamt',
    deposit: 'Anzahlung',
    deposit_due: 'Anzahlung bis',
    payment_due: 'Restzahlung bis',
    status: 'Status',
    addons: 'Extras',
    payment_method: 'Zahlungsmethode',
    swish_info: 'Swish an',
    back: '← Zurück zur Startseite',
    tab_profile: 'Meine Daten',
    tab_bookings: 'Buchungen',
  },
};

const COUNTRIES = [
  { code: 'SE', label: 'Sverige' },
  { code: 'DE', label: 'Deutschland' },
  { code: 'NO', label: 'Norge' },
  { code: 'DK', label: 'Danmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'NL', label: 'Nederland' },
  { code: 'FR', label: 'France' },
  { code: 'OTHER', label: 'Annat land' },
];

export default function MyPage({ locale }) {
  const router = useRouter();
  const lang = router.locale || locale || 'sv';
  const L = PAGE_LABELS[lang] || PAGE_LABELS.sv;
  const SL = STATUS_LABELS[lang] || STATUS_LABELS.sv;
  const { user, loading, logout } = useAuth();

  const [tab, setTab] = useState('bookings');
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '', country: 'SE', address_line1: '', address_line2: '', postal_code: '', city: '' });
  const [passwords, setPasswords] = useState({ current: '', new_pass: '', confirm: '' });
  const [bookings, setBookings] = useState([]);
  const [expandedBooking, setExpandedBooking] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    // Hämta profil
    authApi.me().then(r => {
      setProfile({
        first_name: r.data.first_name || '',
        last_name: r.data.last_name || '',
        phone: r.data.phone || '',
        country: r.data.country || 'SE',
          address_line1: r.data.address_line1 || '',
          address_line2: r.data.address_line2 || '',
          postal_code: r.data.postal_code || '',
          city: r.data.city || '',
      });
    }).catch(() => {});

    // Hämta bokningar
    const token = localStorage.getItem('token');
    axios.get(`${API}/bookings/my`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => setBookings(r.data)).catch(() => setBookings([]));
  }, [user]);

  const saveProfile = async () => {
    setLoadingProfile(true);
    setError(''); setMsg('');
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/auth/me`, profile, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg(L.saved);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setError(e.response?.data?.detail || 'Ett fel uppstod');
    } finally {
      setLoadingProfile(false);
    }
  };

  const changePassword = async () => {
    setPwError(''); setPwMsg('');
    if (passwords.new_pass !== passwords.confirm) {
      setPwError(L.password_mismatch); return;
    }
    if (passwords.new_pass.length < 10) {
      setPwError(L.password_hint); return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/auth/change-password`, {
        current_password: passwords.current,
        new_password: passwords.new_pass,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPwMsg(L.saved);
      setPasswords({ current: '', new_pass: '', confirm: '' });
      setTimeout(() => setPwMsg(''), 3000);
    } catch (e) {
      setPwError(e.response?.data?.detail || 'Fel lösenord');
    }
  };

  if (loading || !user) return null;

  return (
    <>
      <Head><title>{L.title} — Sjölyckan</title></Head>
      <Nav />
      <div style={{ minHeight: '100vh', background: 'var(--sand)', paddingTop: 80 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 4 }}>
                {L.title}
              </h1>
              <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>{user.email}</p>
            </div>
            <a href={router.locale && router.locale !== 'sv' ? `/${router.locale}` : '/'} style={{ fontSize: 13, color: 'var(--water)' }}>{L.back}</a>
          </div>

          {/* Tabbar */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--sand-dark)', background: 'white', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', overflow: 'hidden' }}>
            {[['bookings', L.tab_bookings], ['profile', L.tab_profile]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '14px 24px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 14, fontWeight: tab === key ? 500 : 400,
                color: tab === key ? 'var(--water)' : 'var(--ink-light)',
                borderBottom: tab === key ? '2px solid var(--water)' : '2px solid transparent',
                marginBottom: -1,
              }}>{label}</button>
            ))}
          </div>

          {/* ── BOKNINGAR ── */}
          {tab === 'bookings' && (
            <div>
              {bookings.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: 40, textAlign: 'center', color: 'var(--ink-pale)', fontSize: 14 }}>
                  {L.no_bookings}
                  <div style={{ marginTop: 16 }}>
                    <a href="/#boka" style={{ color: 'var(--water)', fontSize: 14 }}>
                      {lang === 'sv' ? 'Boka nu →' : lang === 'en' ? 'Book now →' : 'Jetzt buchen →'}
                    </a>
                  </div>
                </div>
              ) : (
                bookings.map(b => {
                  const sc = STATUS_COLORS[b.status] || {};
                  const expanded = expandedBooking === b.id;
                  return (
                    <div key={b.id} style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', marginBottom: 12, overflow: 'hidden' }}>
                      <div onClick={() => setExpandedBooking(expanded ? null : b.id)}
                        style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>{b.booking_ref}</div>
                          <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                            {b.date_from} – {b.date_to} · {b.nights} {L.nights}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ ...sc, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                            {SL[b.status] || b.status}
                          </span>
                          <span style={{ color: 'var(--ink-pale)', fontSize: 18 }}>{expanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {expanded && (
                        <div style={{ borderTop: '1px solid var(--sand)', padding: '16px 20px', background: 'var(--sand)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            {[
                              [L.booking_ref, b.booking_ref],
                              [L.dates, `${b.date_from} – ${b.date_to}`],
                              [L.total, `${b.total_amount?.toLocaleString('sv-SE')} kr`],
                              [L.deposit, `${b.deposit_amount?.toLocaleString('sv-SE')} kr`],
                              [L.deposit_due, b.deposit_due_date],
                              [L.payment_due, b.payment_due_date],
                              [L.payment_method, b.payment_method || '–'],
                              [L.status, SL[b.status] || b.status],
                            ].map(([k, v]) => (
                              <div key={k} style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                                <div style={{ fontSize: 11, color: 'var(--ink-pale)', marginBottom: 2 }}>{k}</div>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Swish-info */}
                          {b.status === 'confirmed' && b.payment_method === 'swish' && (
                            <div style={{ background: '#e8f4f8', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: 13, marginBottom: 12 }}>
                              💳 {L.swish_info}: <strong>{b.swish_number || '–'}</strong><br />
                              {lang === 'sv' ? `Ange referens: ${b.booking_ref}` :
                               lang === 'en' ? `Reference: ${b.booking_ref}` :
                               `Referenz: ${b.booking_ref}`}
                            </div>
                          )}

                          {/* Tillägg */}
                          {b.snapshot?.articles?.length > 0 && (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>{L.addons}</div>
                              {b.snapshot.articles.map((a, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13, padding: '3px 0', color: 'var(--ink-light)' }}>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    {(lang==='de'?a.name_de:lang==='en'?a.name_en:a.name_sv)}{a.quantity > 1 ? ` × ${a.quantity}` : ''}
                                    {(lang==='de'?a.desc_de:lang==='en'?a.desc_en:a.desc_sv) ? (
                                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-pale)', marginTop: 2 }}>{(lang==='de'?a.desc_de:lang==='en'?a.desc_en:a.desc_sv)}</span>
                                    ) : null}
                                  </span>
                                  <span style={{ whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>{a.line_total?.toLocaleString('sv-SE')} kr</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Villkor */}
                          {b.terms_snapshot && (
                            <div style={{ marginTop: 12, borderTop: '1px solid var(--sand-dark)', paddingTop: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8 }}>
                                {lang === 'sv' ? 'Godkända villkor' : lang === 'de' ? 'Akzeptierte Bedingungen' : 'Accepted terms'}
                              </div>
                              {b.terms_snapshot.terms_text && (
                                <details style={{ marginBottom: 6 }}>
                                  <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>
                                    {lang === 'sv' ? 'Bokningsvillkor' : lang === 'de' ? 'Buchungsbedingungen' : 'Booking terms'}
                                  </summary>
                                  <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: 8, background: 'white', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: b.terms_snapshot.terms_text }} />
                                </details>
                              )}
                              {b.terms_snapshot.gdpr_text && (
                                <details style={{ marginBottom: 6 }}>
                                  <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>
                                    {lang === 'sv' ? 'Personuppgiftshantering' : lang === 'de' ? 'Datenschutz' : 'Privacy policy'}
                                  </summary>
                                  <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: 8, background: 'white', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: b.terms_snapshot.gdpr_text }} />
                                </details>
                              )}
                              {b.terms_snapshot.house_rules_text && (
                                <details>
                                  <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>
                                    {lang === 'sv' ? 'Husregler' : lang === 'de' ? 'Hausregeln' : 'House rules'}
                                  </summary>
                                  <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: 8, background: 'white', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: b.terms_snapshot.house_rules_text }} />
                                </details>
                              )}
                            </div>
                          )}
                          {/* Tilläggsbegäran */}
                          {b.addons?.filter(a => a.status !== 'rejected').length > 0 && (
                            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--sand-dark)' }}>
                              <div style={{ fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:6 }}>{L.addons}</div>
                              {b.addons.filter(a => a.status !== 'rejected').map((a,i) => (
                                <div key={i} style={{ marginBottom:8 }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--ink-pale)', marginBottom:2 }}>
                                    <span style={{ fontSize:11, padding:'1px 6px', borderRadius:8, background: a.status==='confirmed'?'var(--forest)':'#f0a500', color:'white' }}>
                                      {a.status==='confirmed'?'✓':'⏳'}
                                    </span>
                                    <span style={{ fontWeight:500 }}>{Number(a.total_amount).toLocaleString('sv-SE')} kr</span>
                                  </div>
                                  {a.articles?.map((x,j) => (
                                    <div key={j} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                                      <span>{x.quantity > 1 ? `${x.quantity} × ` : ''}{x[`name_${lang}`] || x.name_sv}</span>
                                      <span style={{ color:'var(--ink-pale)' }}>{Number(x.line_total).toLocaleString('sv-SE')} kr</span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Komplettera bokning */}
                          {(b.status === 'confirmed' || b.status === 'deposit_paid' || b.status === 'fully_paid') && (
                            <a href={`/addon?ref=${b.booking_ref}`}
                              style={{ display:'block', textAlign:'center', marginTop:12, padding:'10px 0', background:'var(--water-pale)', color:'var(--water)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, textDecoration:'none' }}>
                              + {lang==='de'?'Buchung ergänzen':lang==='en'?'Add to booking':'Komplettera bokning'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── PROFIL ── */}
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Kontaktuppgifter */}
              <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', padding: 24 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 20 }}>{L.profile}</h2>

                {msg && <div style={{ background: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
                {error && <div style={{ background: '#f8d7da', color: '#721c24', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>{L.first_name}</label>
                    <input value={profile.first_name} onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>{L.last_name}</label>
                    <input value={profile.last_name} onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} style={inp} />
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>{L.email}</label>
                  <input value={user.email} disabled style={{ ...inp, background: 'var(--sand)', color: 'var(--ink-pale)' }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>{L.phone}</label>
                  <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+46 70 123 45 67" style={inp} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>{L.country}</label>
                  <select value={profile.country} onChange={e => setProfile(p => ({ ...p, country: e.target.value }))} style={inp}>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>{L.address}</label>
                  <input value={profile.address_line1 || ''} onChange={e => setProfile(p => ({ ...p, address_line1: e.target.value }))} placeholder="Storgatan 12" style={inp} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>{L.address2}</label>
                  <input value={profile.address_line2 || ''} onChange={e => setProfile(p => ({ ...p, address_line2: e.target.value }))} placeholder="Lgh 1002" style={inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>{L.postal_code}</label>
                    <input value={profile.postal_code || ''} onChange={e => setProfile(p => ({ ...p, postal_code: e.target.value }))} placeholder="123 45" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>{L.city}</label>
                    <input value={profile.city || ''} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} placeholder="Stockholm" style={inp} />
                  </div>
                </div>

                <button onClick={saveProfile} disabled={loadingProfile} style={saveBtn}>
                  {loadingProfile ? '...' : L.save}
                </button>
              </div>

              {/* Byt lösenord */}
              <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', padding: 24 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 20 }}>{L.password_section}</h2>

                {pwMsg && <div style={{ background: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 }}>{pwMsg}</div>}
                {pwError && <div style={{ background: '#f8d7da', color: '#721c24', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 }}>{pwError}</div>}

                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>{L.current_password}</label>
                  <PasswordField value={passwords.current} onChange={v => setPasswords(p => ({ ...p, current: v }))} style={inp} lang={lang} autoComplete="current-password" />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>{L.new_password}</label>
                  <PasswordField value={passwords.new_pass} onChange={v => setPasswords(p => ({ ...p, new_pass: v }))} style={inp} lang={lang} showRequirements showGenerate />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <label style={lbl}>{L.confirm_password}</label>
                  <PasswordField value={passwords.confirm} onChange={v => setPasswords(p => ({ ...p, confirm: v }))} style={inp} lang={lang} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--ink-pale)', marginBottom: 16 }}>{L.password_hint}</p>

                <button onClick={changePassword} style={saveBtn}>{L.change_password}</button>
              </div>

              {/* Logga ut */}
              <button onClick={() => { logout(); router.push('/'); }} style={{ padding: '10px 0', background: 'transparent', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--ink-light)' }}>
                {lang === 'sv' ? 'Logga ut' : lang === 'en' ? 'Log out' : 'Abmelden'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const lbl = { fontSize: 11, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 3 };
const inp = { width: '100%', padding: '9px 12px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none', color: 'var(--ink)', background: 'white', boxSizing: 'border-box' };
const saveBtn = { width: '100%', padding: 11, background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 14, fontWeight: 500 };

export async function getServerSideProps({ locale }) {
  return { props: { locale: locale || 'sv', ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
