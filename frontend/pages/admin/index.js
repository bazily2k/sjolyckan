import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';
import axios from 'axios';
const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const STATUS_COLORS = {
  pending: { bg: '#fef3cd', color: '#856404', label: 'Väntar' },
  confirmed: { bg: '#d1ecf1', color: '#0c5460', label: 'Bekräftad' },
  deposit_paid: { bg: '#d4edda', color: '#155724', label: 'Handp. betald' },
  partially_paid: { bg: '#ffe5b4', color: '#8a5a00', label: 'Delbetald' },
  paid: { bg: '#d4edda', color: '#155724', label: 'Betald' },
  cancelled: { bg: '#f8d7da', color: '#721c24', label: 'Avbokad' },
  expired: { bg: '#e2e3e5', color: '#383d41', label: 'Förfallen' },
  pending_email_verify: { bg: '#e7d9f7', color: '#5a3a86', label: 'Väntar på e-post' },
};

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payMethod, setPayMethod] = useState('paypal');
  const [payMethods, setPayMethods] = useState(['paypal','stripe']);
  const [discountAmount, setDiscountAmount] = useState('');
  const [removedArticles, setRemovedArticles] = useState(new Set());
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustedTotals, setAdjustedTotals] = useState(null);
  const [availableArticles, setAvailableArticles] = useState([]);
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [addArticleLoading, setAddArticleLoading] = useState(false);
  const [addArticleQty, setAddArticleQty] = useState(1);
  const [adminNote, setAdminNote] = useState('');
  const [depositDue, setDepositDue] = useState('');
  const [codeItems, setCodeItems] = useState([]);
  const [codeValues, setCodeValues] = useState({});
  const [checkinDate, setCheckinDate] = useState('');
  const [checkinMsg, setCheckinMsg] = useState('');
  const [paymentDue, setPaymentDue] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [sortBy, setSortBy] = useState('booking_ref');
  const [sortDir, setSortDir] = useState('desc');
  const [hiddenIds, setHiddenIds] = useState(new Set());

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const sortedBookings = [...bookings]
    .sort((a, b) => {
      let av, bv;
      if (sortBy === 'booking_ref') { av = a.booking_ref; bv = b.booking_ref; }
      else if (sortBy === 'guest_name') { av = a.guest_name; bv = b.guest_name; }
      else if (sortBy === 'date_from') { av = a.date_from; bv = b.date_from; }
      else if (sortBy === 'nights') { av = a.nights; bv = b.nights; }
      else if (sortBy === 'total_amount') { av = a.total_amount; bv = b.total_amount; }
      else if (sortBy === 'status') { av = a.status; bv = b.status; }
      else if (sortBy === 'payment_method') { av = a.payment_method || ''; bv = b.payment_method || ''; }
      else { av = a[sortBy]; bv = b[sortBy]; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const deleteBooking = async (id) => {
    if (!window.confirm('Radera bokningen permanent? Detta går inte att ångra.')) return;
    try {
      await axios.delete(API + '/bookings/admin/' + id,
        { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }
      );
      load();
      setSelected(null);
    } catch(e) {
      alert('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const [showHidden, setShowHidden] = useState(false);

  const hideBooking = async (id) => {
    try {
      await axios.patch(API + '/bookings/admin/' + id + '/hide',
        {},
        { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }
      );
      load();
      if (selected?.id === id) setSelected(null);
    } catch(e) {
      alert('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span style={{opacity:0.3, marginLeft:3}}>↕</span>;
    return <span style={{marginLeft:3}}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };
  const [payRef, setPayRef] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [emailAlert, setEmailAlert] = useState(null);
  const [manualTemplates, setManualTemplates] = useState([]);
  const [bookingAddons, setBookingAddons] = useState([]);
  const [addonNote, setAddonNote] = useState('');

  const changeStatus = async (id, status) => {
    const labels = {
      pending: 'Väntande', confirmed: 'Bekräftad', deposit_paid: 'Handpenning betald',
      partially_paid: 'Delbetald', paid: 'Fullbetald', cancelled: 'Avbokad', expired: 'Förfallen',
    };
    if (!window.confirm('Ändra status till "' + (labels[status] || status) + '"?')) return;
    try {
      await axios.patch(API + '/bookings/admin/' + id + '/status',
        { status, note: statusNote },
        { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }
      );
      setStatusNote('');
      load();
      setSelected(prev => prev ? { ...prev, status } : null);
    } catch(e) {
      alert('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const load = () => {
    setLoading(true);
    adminApi.listBookings(filter || undefined, showHidden)
      .then(r => setBookings(Array.isArray(r.data) ? r.data : (r.data.items || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, showHidden]);

  useEffect(() => {
    adminApi.listArticles().then(r => setAvailableArticles(r.data)).catch(() => {});
  }, []);

  const addArticle = async () => {
    if (!selectedArticleId || !selected) return;
    setAddArticleLoading(true);
    try {
      const r = await adminApi.addArticle(selected.id, { article_id: parseInt(selectedArticleId), quantity: addArticleQty });
      setAdjustedTotals(r.data);
      setSelected(prev => ({
        ...prev,
        total_amount: r.data.total_amount,
        deposit_amount: r.data.deposit_amount,
        articles_amount: r.data.articles_amount,
        articles: [...(prev.articles || []), r.data.article],
      }));
      setSelectedArticleId('');
      setAddArticleQty(1);
      setMsg('Tillägg lagt till!');
    } catch(e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    } finally {
      setAddArticleLoading(false);
    }
  };

  const togglePayMethod = (m) => {
    setPayMethods(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const toggleRemoveArticle = (articleId) => {
    setRemovedArticles(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const applyAdjustment = async () => {
    if (!selected) return;
    setAdjustLoading(true);
    try {
      const r = await adminApi.adjustBooking(selected.id, {
        discount_amount: parseFloat(discountAmount) || 0,
        remove_article_ids: Array.from(removedArticles),
      });
      setAdjustedTotals(r.data);
      setSelected(prev => ({
        ...prev,
        total_amount: r.data.total_amount,
        deposit_amount: r.data.deposit_amount,
        articles_amount: r.data.articles_amount,
        articles: (prev.articles || []).filter(a => !removedArticles.has(a.article_id)),
      }));
      setRemovedArticles(new Set());
      setDiscountAmount('');
      setMsg('Justering sparad!');
    } catch(e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    } finally {
      setAdjustLoading(false);
    }
  };

  // Förifyll förfallodatum när en bokning öppnas
  useEffect(() => {
    if (selected) {
      setDepositDue(selected.deposit_due_date || '');
      setCheckinDate(selected.checkin_send_date || '');
      const cv = {}; (selected.checkin_codes || []).forEach(c => { cv[c.item_id] = c.value; }); setCodeValues(cv);
      adminApi.listCheckinInfo().then(r => setCodeItems((r.data || []).filter(i => i.item_type === 'code'))).catch(() => setCodeItems([]));
      setCheckinMsg('');
      setPaymentDue(selected.payment_due_date || '');
    }
  }, [selected?.id]);

  const saveCheckin = async () => {
    try {
      await adminApi.setCheckin(selected.id, { codes: codeValues, checkin_send_date: checkinDate || null });
      setCheckinMsg('Sparat.');
    } catch (e) { setCheckinMsg('Kunde inte spara.'); }
  };

  const confirm = async (id) => {
    setActionLoading(true);
    try {
      const hasDeposit = Number(selected?.deposit_amount || 0) > 0;
      await adminApi.confirmBooking(id, {
        payment_method: payMethods[0] || payMethod,
        payment_methods: payMethods.join(','),
        admin_note: adminNote,
        deposit_due_date: hasDeposit && depositDue ? depositDue : null,
        payment_due_date: paymentDue || null,
      });
      setMsg('Bokning bekräftad — bekräftelsemejl skickat!');
      load(); setSelected(null);
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    } finally { setActionLoading(false); }
  };

  const reject = async (id) => {
    if (!window.confirm('Neka denna bokning?')) return;
    await adminApi.rejectBooking(id);
    setMsg('Bokning nekad.'); load(); setSelected(null);
  };

  const registerPay = async (id, type) => {
    setActionLoading(true);
    try {
      const amt = type === 'deposit'
        ? selected.deposit_amount
        : (selected.amount_due ?? (selected.total_amount - selected.deposit_amount));
      await adminApi.registerPayment(id, { payment_type: type, amount: amt, reference: payRef });
      setMsg('Betalning registrerad!');
      load();
      const res = await adminApi.getBooking(id);
      setSelected(res.data);
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    } finally { setActionLoading(false); }
  };

  return (
    <>
      <Head><title>Bokningar — Admin Sjölyckan</title></Head>
      <AdminLayout title="Bokningar">
        {msg && (
          <div style={{ background: 'var(--water-pale)', border: '1px solid var(--water)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            {msg} <button onClick={() => setMsg('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {/* Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['', 'pending_email_verify', 'pending', 'confirmed', 'deposit_paid', 'partially_paid', 'paid', 'cancelled'].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid var(--sand-dark)',
                background: filter === s ? 'var(--water)' : 'white',
                color: filter === s ? 'white' : 'var(--ink-light)',
                cursor: 'pointer', fontSize: 13,
              }}>
                {s === '' ? 'Alla' : STATUS_COLORS[s]?.label || s}
              </button>
            ))}
          </div>
          <button onClick={() => setShowHidden(h => !h)} style={{
            padding: '6px 14px', fontSize: 12, border: '1px solid var(--sand-dark)',
            borderRadius: 20, background: showHidden ? 'var(--ink)' : 'white',
            color: showHidden ? 'white' : 'var(--ink-light)', cursor: 'pointer',
          }}>
            {showHidden ? '👁 Döljer dolda' : '👁 Visa dolda'}
          </button>
        </div>

        {/* Tabell */}
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)' }}>
                {[
                  { label: 'Ref', col: 'booking_ref' },
                  { label: 'Gäst', col: 'guest_name' },
                  { label: 'Datum', col: 'date_from' },
                  { label: 'Nätter', col: 'nights' },
                  { label: 'Belopp', col: 'total_amount' },
                  { label: 'Status', col: 'status' },
                  { label: 'Betals.', col: 'payment_method' },
                  { label: '', col: null },
                ].map(({ label, col }) => (
                  <th key={label} onClick={col ? () => toggleSort(col) : undefined}
                    style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: col ? 'var(--ink)' : 'var(--ink-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3px', cursor: col ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label}{col && <SortIcon col={col} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--ink-pale)' }}>Laddar...</td></tr>
              ) : sortedBookings.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--ink-pale)' }}>Inga bokningar hittades</td></tr>
              ) : sortedBookings.map(b => {
                const sc = STATUS_COLORS[b.status] || {};
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--sand)', cursor: 'pointer' }}
                    onClick={() => { adminApi.getBooking(b.id).then(r => { setSelected(r.data); setBookingAddons([]); setAddonNote(''); adminApi.getBookingAddons(r.data.id).then(ar => setBookingAddons(ar.data)).catch(()=>{}); }); }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--water)' }}>{b.booking_ref}</td>
                    <td style={{ padding: '10px 14px' }}>{b.guest_name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-light)' }}>{b.date_from} – {b.date_to}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-light)' }}>{b.nights}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                      {b.total_amount?.toLocaleString('sv-SE')} kr
                      {typeof b.pending_addons_count === 'number' && b.pending_addons_count > 0 && (
                        <span title={`${b.pending_addons_count} väntande tilläggsbeställning${b.pending_addons_count > 1 ? 'ar' : ''} att hantera`}
                          style={{ marginLeft: 6, cursor: 'default' }}>🔔</span>
                      )}
                      {typeof b.amount_due === 'number' && b.amount_due > 0 && (
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#c0392b', marginTop: 2 }}>
                          Kvar: {b.amount_due.toLocaleString('sv-SE')} kr
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-light)' }}>{b.payment_method || '–'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {b.status === 'pending' && (
                          <span style={{ color: 'var(--water)', fontSize: 12, marginRight: 4 }}>Hantera →</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); hideBooking(b.id); }} title={b.hidden ? 'Visa' : 'Dölj'}
                          style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--sand-dark)', borderRadius: 4, background: b.hidden ? 'var(--sand)' : 'white', cursor: 'pointer', color: 'var(--ink-pale)' }}>
                          {b.hidden ? '👁‍🗨' : '👁'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteBooking(b.id); }} title="Radera"
                          style={{ padding: '2px 7px', fontSize: 11, border: '1px solid #f5c6cb', borderRadius: 4, background: 'white', cursor: 'pointer', color: 'var(--red)' }}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detalj-modal */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
            <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', padding: 28, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{selected.booking_ref}</h2>
                <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-pale)' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
                {[
                  ['Gäst', selected.guest_name],
                  ['E-post', selected.user_email || selected.guest_email],
                  ['Telefon', selected.guest_phone || '–'],
                  ['Meddelande', selected.message || '–'],
                  ['Land', selected.guest_country],
                  ['Ankomst', selected.date_from],
                  ['Avresa', selected.date_to],
                  ['Nätter', selected.nights],
                  ['Gäster', selected.guests_count],
                  ['Belopp', `${selected.total_amount?.toLocaleString('sv-SE')} kr`],
                  ['Handpenning', `${selected.deposit_amount?.toLocaleString('sv-SE')} kr`],
                  ['Handp. förfaller', selected.deposit_due_date],
                  ['Slutbet. förfaller', selected.payment_due_date],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--sand)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-pale)', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Prisspecifikation */}
              <div style={{ marginBottom: 16, borderTop: '1px solid var(--sand-dark)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-pale)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Prisspecifikation</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--ink-light)' }}>
                  <span>Boende ({selected.nights} nätter)</span>
                  <span>{selected.base_amount?.toLocaleString('sv-SE')} kr</span>
                </div>
                {(selected.snapshot?.articles || selected.articles)?.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13, padding: '4px 0', color: 'var(--ink-light)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {a.name_sv}{a.quantity > 1 ? ` × ${a.quantity}` : ''}
                      {a.desc_sv ? <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-pale)', marginTop: 2 }}>{a.desc_sv}</span> : null}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>{a.line_total?.toLocaleString('sv-SE')} kr</span>
                  </div>
                ))}
                {selected.snapshot?.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--forest)' }}>
                    <span>Rabatt</span>
                    <span>−{selected.snapshot.discount_amount?.toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, padding: '8px 0 4px', borderTop: '1px solid var(--sand-dark)', marginTop: 4 }}>
                  <span>Totalt</span>
                  <span>{selected.total_amount?.toLocaleString('sv-SE')} kr</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: 'var(--water)' }}>
                  <span>Handpenning (10%)</span>
                  <span>{selected.deposit_amount?.toLocaleString('sv-SE')} kr</span>
                </div>
                {typeof selected.amount_paid === 'number' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: 'var(--ink-light)' }}>
                    <span>Betalt hittills</span>
                    <span>{selected.amount_paid.toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
                {typeof selected.amount_due === 'number' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, padding: '4px 0 2px', color: selected.amount_due > 0 ? '#c0392b' : 'var(--forest)' }}>
                    <span>Kvarstående</span>
                    <span>{selected.amount_due.toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
              </div>

              {/* Ändra status fritt */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sand-dark)' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8 }}>Ändra status</div>
                <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)}
                  placeholder="Anledning till statusändring (valfritt)"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, height: 60, marginBottom: 8, resize: 'none' }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { value: 'pending', label: 'Väntande' },
                    { value: 'confirmed', label: 'Bekräftad' },
                    { value: 'deposit_paid', label: 'Handp. betald' },
                    { value: 'partially_paid', label: 'Delbetald' },
                    { value: 'paid', label: 'Fullbetald' },
                    { value: 'cancelled', label: 'Avbokad' },
                    { value: 'expired', label: 'Förfallen' },
                  ].map(s => (
                    <button key={s.value} onClick={() => changeStatus(selected.id, s.value)}
                      disabled={selected.status === s.value}
                      style={{
                        padding: '5px 12px', fontSize: 12, border: '1px solid var(--sand-dark)',
                        borderRadius: 'var(--radius-md)', cursor: selected.status === s.value ? 'default' : 'pointer',
                        background: selected.status === s.value ? 'var(--sand-dark)' : 'white',
                        color: selected.status === s.value ? 'var(--ink-pale)' : 'var(--ink)',
                        opacity: selected.status === s.value ? 0.5 : 1,
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Incheckning: koder per bokning + utskicksdatum */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sand-dark)' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8 }}>Incheckningsmejl</div>
                {codeItems.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 8 }}>Inga kod-punkter definierade. Skapa dem under Inställningar → Incheckningsinfo.</div>}
                {codeItems.map(it => (
                  <div key={it.id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>{it.icon} {it.title_sv}</div>
                    <input value={codeValues[it.id] || ''} placeholder="Fyll i värde för denna bokning (tomt = visas ej)"
                      onChange={e => setCodeValues(v => ({ ...v, [it.id]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13 }} />
                  </div>
                ))}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>Skicka incheckningsmejl (tomt = dagen före ankomst)</div>
                  <input type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={saveCheckin} style={{ padding: '7px 16px', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>Spara incheckning</button>
                  <button onClick={async () => {
                      await saveCheckin();
                      if (!window.confirm('Skicka incheckningsmejlet till gästen nu?')) return;
                      try {
                        await adminApi.resendBookingEmail(selected.id, 'checkin_info');
                        setCheckinMsg('✉️ Incheckningsmejl skickat till ' + (selected.user_email || selected.guest_email));
                      } catch (e) { setCheckinMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
                    }}
                    style={{ padding: '7px 16px', background: 'var(--forest)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                    ✉️ Skicka incheckningsmejl nu
                  </button>
                  {checkinMsg && <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>{checkinMsg}</span>}
                </div>
              </div>



              {/* Åtgärder baserat på status */}
              {selected.status === 'pending' && (
                <div style={{ borderTop: '1px solid var(--sand-dark)', paddingTop: 16 }}>
                  {/* Prisjustering */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Justera pris</div>
                    {selected.articles?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 6 }}>Ta bort tillägg:</div>
                        {selected.articles.map((a) => (
                          <label key={a.article_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4, cursor: 'pointer' }}>
                            <input type="checkbox"
                              checked={removedArticles.has(a.article_id)}
                              onChange={() => toggleRemoveArticle(a.article_id)}
                            />
                            <span>{a.name_sv}</span>
                            <span style={{ color: 'var(--ink-pale)', marginLeft: 'auto' }}>−{a.line_total?.toLocaleString('sv-SE')} kr</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>Rabatt (kr):</div>
                        <input type="number" min="0" value={discountAmount}
                          onChange={e => setDiscountAmount(e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13 }}
                        />
                      </div>
                      <button onClick={applyAdjustment} disabled={adjustLoading || (!discountAmount && removedArticles.size === 0)}
                        style={{ marginTop: 18, padding: '8px 14px', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: (!discountAmount && removedArticles.size === 0) ? 0.5 : 1 }}>
                        {adjustLoading ? '...' : 'Tillämpa'}
                      </button>
                    </div>
                    {adjustedTotals && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--sand)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                        ✓ Nytt totalt: <strong>{adjustedTotals.total_amount?.toLocaleString('sv-SE')} kr</strong> · Handpenning: <strong>{adjustedTotals.deposit_amount?.toLocaleString('sv-SE')} kr</strong>
                      </div>
                    )}
                  </div>
                  {/* Lägg till tillägg */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 6 }}>Lägg till tillägg:</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={selectedArticleId} onChange={e => setSelectedArticleId(e.target.value)}
                        style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, background: 'white' }}>
                        <option value="">Välj tillägg...</option>
                        {availableArticles
                          .filter(a => a.active && !selected.articles?.some(sa => sa.article_id === a.id))
                          .map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name_sv} ({a.price_type === 'per_night' ? a.price + ' kr/natt' : a.price_type === 'per_guest' ? a.price + ' kr/gäst' : a.price + ' kr'})
                            </option>
                          ))}
                      </select>
                      {selectedArticleId && availableArticles.find(a => a.id === parseInt(selectedArticleId))?.price_type === 'per_occasion' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setAddArticleQty(q => Math.max(1, q-1))} style={{ width: 24, height: 32, border: '1px solid var(--sand-dark)', borderRadius: 4, background: 'white', cursor: 'pointer' }}>−</button>
                          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{addArticleQty}</span>
                          <button onClick={() => setAddArticleQty(q => q+1)} style={{ width: 24, height: 32, border: '1px solid var(--sand-dark)', borderRadius: 4, background: 'white', cursor: 'pointer' }}>+</button>
                        </div>
                      )}
                      <button onClick={addArticle} disabled={addArticleLoading || !selectedArticleId}
                        style={{ padding: '7px 14px', background: 'var(--forest)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: !selectedArticleId ? 0.5 : 1 }}>
                        {addArticleLoading ? '...' : '+ Lägg till'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Betalningsmetod(er)</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[{v:'swish',l:'Swish'},{v:'paypal',l:'PayPal'},{v:'stripe',l:'Stripe'},{v:'manual',l:'Manuell'}].map(m => (
                      <label key={m.v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={payMethods.includes(m.v)}
                          onChange={() => togglePayMethod(m.v)}
                        />
                        {m.l}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Förfallodatum</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {Number(selected.deposit_amount || 0) > 0 && (
                      <label style={{ fontSize: 12, color: 'var(--ink-light)', flex: 1, minWidth: 140 }}>
                        Handpenning förfaller
                        <input type="date" value={depositDue} onChange={e => setDepositDue(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, marginTop: 4 }} />
                      </label>
                    )}
                    <label style={{ fontSize: 12, color: 'var(--ink-light)', flex: 1, minWidth: 140 }}>
                      Slutbetalning förfaller
                      <input type="date" value={paymentDue} onChange={e => setPaymentDue(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, marginTop: 4 }} />
                    </label>
                  </div>
                  {Number(selected.deposit_amount || 0) === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 12, fontStyle: 'italic' }}>
                      Ingen handpenning på denna bokning — endast slutbetalning gäller.
                    </p>
                  )}
                  <textarea placeholder="Admin-notering (syns ej för gästen)" value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, height: 60, marginBottom: 12, resize: 'none' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selected.user_id && (
                      <button onClick={async () => { try { const res = await adminApi.resendSetupEmail(selected.user_id); setMsg('Inloggningsinbjudan skickad till ' + res.data.email); setSelected(prev => ({...prev, user_email: res.data.email})); } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); } }}
                        style={{ padding:'8px 14px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, marginBottom:8, width:'100%' }}>
                        ✉️ Skicka om inloggningsinbjudan
                      </button>
                    )}
                    {(selected.status === 'confirmed' || selected.status === 'deposit_paid' || selected.status === 'partially_paid' || selected.status === 'paid') && (
                      <button onClick={async () => { try { await adminApi.resendBookingEmail(selected.id, 'booking_confirmed'); setMsg('Bokningsbekräftelse skickad till ' + (selected.user_email || selected.guest_email)); } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); } }}
                        style={{ padding:'8px 14px', background:'var(--forest)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, marginBottom:8, width:'100%' }}>
                        ✉️ Skicka om bokningsbekräftelse
                      </button>
                    )}
                    {manualTemplates.length > 0 && selected.status === 'pending' && (
                      <div style={{ borderTop:'1px solid var(--sand)', paddingTop:8, marginTop:4 }}>
                        <div style={{ fontSize:11, color:'var(--ink-pale)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.4px' }}>Manuella utskick</div>
                        {manualTemplates.map(t => (
                          <button key={t.id} onClick={async () => { try { await adminApi.sendManualTemplate(t.id, selected.id); setMsg(`✉️ '${t.name}' skickat till ${selected.user_email||selected.guest_email}`); } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); } }}
                            style={{ padding:'8px 14px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, marginBottom:6, width:'100%' }}>
                            ✉️ {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => confirm(selected.id)} disabled={actionLoading}
                      style={{ flex: 1, padding: 10, background: 'var(--forest)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
                      ✓ Godkänn
                    </button>
                    <button onClick={() => reject(selected.id)}
                      style={{ flex: 1, padding: 10, background: 'white', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
                      ✗ Neka
                    </button>
                  </div>
                </div>
              )}

              {/* Väntar på e-bekräftelse */}
              {selected.status === 'pending_email_verify' && (
                <div style={{ borderTop: '1px solid var(--sand-dark)', paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Väntar på e-postbekräftelse</div>
                  <p style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 10 }}>Gästen har ännu inte bekräftat sin e-postadress. Bokningsförfrågan skickas in först efter bekräftelse.</p>
                  <button onClick={async () => { try { await adminApi.resendVerifyEmail(selected.id); setMsg('Verifieringsmail skickat till ' + (selected.user_email || selected.guest_email)); } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); } }}
                    style={{ padding:'8px 14px', background:'#7c4dbb', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, width:'100%' }}>
                    ✉️ Skicka om verifieringsmail
                  </button>
                </div>
              )}

              {/* Registrera betalning */}
              {(selected.status === 'confirmed' || selected.status === 'deposit_paid' || selected.status === 'partially_paid') && (
                <div style={{ borderTop: '1px solid var(--sand-dark)', paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Registrera betalning</div>
                  <input placeholder="Referens (Swish-nr, kvittonr etc)" value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selected.status === 'confirmed' && (
                      <button onClick={() => registerPay(selected.id, 'deposit')} disabled={actionLoading}
                        style={{ flex: 1, padding: 9, background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                        Handpenning betald
                      </button>
                    )}
                    {selected.status === 'deposit_paid' && (
                      <button onClick={() => registerPay(selected.id, 'final')} disabled={actionLoading}
                        style={{ flex: 1, padding: 9, background: 'var(--forest)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                        Slutbetalning mottagen
                      </button>
                    )}
                    {selected.status === 'partially_paid' && (
                      <button onClick={() => registerPay(selected.id, 'final')} disabled={actionLoading}
                        style={{ flex: 1, padding: 9, background: 'var(--forest)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                        Kvarstående mottaget ({selected.amount_due?.toLocaleString('sv-SE')} kr)
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 6 }}>Skicka betalningslänk till gäst:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-pale)' }}>🔵 PayPal</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {selected.status === 'confirmed' && (
                          <button onClick={async () => {
                            const link = `${window.location.origin}/pay/${selected.booking_ref}`;
                            navigator.clipboard.writeText(link);
                            setMsg('Betalningslänk kopierad: ' + link);
                          }} style={{ flex: 1, padding: 9, background: '#003087', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                            🔵 Kopiera länk – handpenning ({selected.deposit_amount?.toLocaleString('sv-SE')} kr)
                          </button>
                        )}
                        {(selected.status === 'deposit_paid' || selected.status === 'partially_paid') && (
                          <button onClick={async () => {
                            const link = `${window.location.origin}/pay/${selected.booking_ref}`;
                            navigator.clipboard.writeText(link);
                            setMsg('Betalningslänk kopierad: ' + link);
                          }} style={{ flex: 1, padding: 9, background: '#003087', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                            🔵 Kopiera länk – kvarstående ({(selected.amount_due ?? (selected.total_amount - selected.deposit_amount))?.toLocaleString('sv-SE')} kr)
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-pale)', marginTop: 4 }}>💳 Stripe</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {selected.status === 'confirmed' && (
                          <button onClick={async () => {
                            const link = `${window.location.origin}/pay/${selected.booking_ref}`;
                            navigator.clipboard.writeText(link);
                            setMsg('Betalningslänk kopierad: ' + link);
                          }} style={{ flex: 1, padding: 9, background: '#635bff', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                            💳 Kopiera länk – handpenning ({selected.deposit_amount?.toLocaleString('sv-SE')} kr)
                          </button>
                        )}
                        {(selected.status === 'deposit_paid' || selected.status === 'partially_paid') && (
                          <button onClick={async () => {
                            const link = `${window.location.origin}/pay/${selected.booking_ref}`;
                            navigator.clipboard.writeText(link);
                            setMsg('Betalningslänk kopierad: ' + link);
                          }} style={{ flex: 1, padding: 9, background: '#635bff', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                            💳 Kopiera länk – kvarstående ({(selected.amount_due ?? (selected.total_amount - selected.deposit_amount))?.toLocaleString('sv-SE')} kr)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tilläggsbegäran */}
              {bookingAddons.length > 0 && (
                <div style={{ borderTop:'1px solid var(--sand-dark)', paddingTop:12, marginTop:16 }}>
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Tilläggsbegäran</div>
                  {bookingAddons.map(a => (
                    <div key={a.id} style={{ background:'var(--sand)', borderRadius:'var(--radius-md)', padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ marginBottom:6 }}>
                        {a.articles?.map((x,i) => (
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:2 }}>
                            <span>{x.quantity > 1 ? `${x.quantity} × ` : ''}{x.name_sv}</span>
                            <span style={{ color:'var(--ink-pale)' }}>{Number(x.line_total).toLocaleString('sv-SE')} kr</span>
                          </div>
                        ))}
                        {a.discount_amount > 0 && (
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--forest)', marginBottom:2 }}>
                            <span>Rabatt</span>
                            <span>−{Number(a.discount_amount).toLocaleString('sv-SE')} kr</span>
                          </div>
                        )}
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, borderTop:'1px solid var(--sand-dark)', marginTop:4, paddingTop:4 }}>
                          <span>Totalt</span>
                          <span>{Number(a.total_amount).toLocaleString('sv-SE')} kr</span>
                        </div>
                      </div>
                      {a.message && <div style={{ fontSize:11, color:'var(--ink-pale)', marginBottom:6 }}>"{a.message}"</div>}
                      {a.status === 'pending' ? (
                        <>
                          <textarea value={addonNote} onChange={e=>setAddonNote(e.target.value)}
                            placeholder='Meddelande till kunden (valfritt)' rows={2}
                            style={{ width:'100%', fontSize:12, padding:'6px 8px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', resize:'vertical', boxSizing:'border-box', marginBottom:6, fontFamily:'inherit' }} />
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={async()=>{ try{ await adminApi.confirmAddon(a.id,{admin_note:addonNote}); setMsg('Tillägg godkänt!'); adminApi.getBookingAddons(selected.id).then(r=>setBookingAddons(r.data)).catch(()=>{}); adminApi.getBooking(selected.id).then(r=>setSelected(r.data)).catch(()=>{}); load(); }catch(e){setMsg('Fel: '+(e.response?.data?.detail||e.message));}}} style={{ flex:1, padding:'6px 0', background:'var(--forest)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12 }}>✓ Godkänn</button>
                            <button onClick={async()=>{ try{ await adminApi.rejectAddon(a.id,{admin_note:addonNote}); setMsg('Tillägg nekat.'); adminApi.getBookingAddons(selected.id).then(r=>setBookingAddons(r.data)).catch(()=>{}); load(); }catch(e){setMsg('Fel: '+(e.response?.data?.detail||e.message));}}} style={{ flex:1, padding:'6px 0', background:'white', color:'var(--red)', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12 }}>✗ Neka</button>
                          </div>
                        </>
                      ) : (
                        <div>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background: a.status==='confirmed'?'var(--forest)':'var(--red)', color:'white' }}>
                            {a.status==='confirmed'?'✓ Godkänd':'✗ Nekad'}
                          </span>
                          {a.admin_note && <div style={{ fontSize:11, color:'var(--ink-pale)', marginTop:6, fontStyle:'italic' }}>Ditt svar: "{a.admin_note}"</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Villkor & husregler */}
              {selected.terms_snapshot && (
                <div style={{ borderTop: '1px solid var(--sand-dark)', paddingTop: 12, marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 8 }}>GODKÄNDA VILLKOR VID BOKNINGSTILLFÄLLET</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, background: selected.terms_accepted ? 'var(--water-pale)' : '#fce8e8', color: selected.terms_accepted ? 'var(--water)' : 'var(--red)', padding: '3px 8px', borderRadius: 'var(--radius-md)' }}>
                      {selected.terms_accepted ? '✓' : '✗'} Bokningsvillkor
                    </span>
                    <span style={{ fontSize: 12, background: selected.gdpr_accepted ? 'var(--water-pale)' : '#fce8e8', color: selected.gdpr_accepted ? 'var(--water)' : 'var(--red)', padding: '3px 8px', borderRadius: 'var(--radius-md)' }}>
                      {selected.gdpr_accepted ? '✓' : '✗'} GDPR
                    </span>
                    <span style={{ fontSize: 12, background: selected.house_rules_accepted ? 'var(--water-pale)' : '#fce8e8', color: selected.house_rules_accepted ? 'var(--water)' : 'var(--red)', padding: '3px 8px', borderRadius: 'var(--radius-md)' }}>
                      {selected.house_rules_accepted ? '✓' : '✗'} Husregler
                    </span>
                  </div>
                  {selected.terms_snapshot.terms_text && (
                    <details style={{ marginBottom: 6 }}>
                      <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>Visa bokningsvillkor</summary>
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: '8px', background: 'var(--sand)', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: selected.terms_snapshot.terms_text }} />
                    </details>
                  )}
                  {selected.terms_snapshot.gdpr_text && (
                    <details style={{ marginBottom: 6 }}>
                      <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>Visa GDPR</summary>
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: '8px', background: 'var(--sand)', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: selected.terms_snapshot.gdpr_text }} />
                    </details>
                  )}
                  {selected.terms_snapshot.house_rules_text && (
                    <details>
                      <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ink-light)' }}>Visa husregler</summary>
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', padding: '8px', background: 'var(--sand)', borderRadius: 'var(--radius-md)', marginTop: 4 }} className="ql-content" dangerouslySetInnerHTML={{ __html: selected.terms_snapshot.house_rules_text }} />
                    </details>
                  )}
                </div>
              )}
              {/* Betalningslogg */}
              {selected.payments?.length > 0 && (
                <div style={{ borderTop: '1px solid var(--sand-dark)', paddingTop: 12, marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 6 }}>BETALNINGSHISTORIK</div>
                  {selected.payments.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: p.status === 'paid' ? 'var(--forest)' : 'var(--ink-light)' }}>
                      <span>{p.type} · {p.method}</span>
                      <span>{p.status === 'paid' ? '✓' : '○'} {p.amount?.toLocaleString('sv-SE')} kr</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </AdminLayout>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
