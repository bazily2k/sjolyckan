import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const STATUS = {
  pending: { bg: '#fef3cd', color: '#856404', label: 'Väntar' },
  pending_email_verify: { bg: '#e7d9f7', color: '#5a3a86', label: 'Väntar på e-post' },
  confirmed: { bg: '#d1ecf1', color: '#0c5460', label: 'Bekräftad' },
  deposit_paid: { bg: '#d4edda', color: '#155724', label: 'Handp. betald' },
  paid: { bg: '#d4edda', color: '#155724', label: 'Betald' },
  expired: { bg: '#e2e3e5', color: '#383d41', label: 'Förfallen' },
};
const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

const st = (s) => STATUS[s] || { bg: '#eee', color: '#333', label: s };
const kr = (n) => (n || 0).toLocaleString('sv-SE');

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // måndag först
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function monthsBetween(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  const out = [];
  let y = s.getFullYear(), m = s.getMonth();
  while (y < e.getFullYear() || (y === e.getFullYear() && m < e.getMonth())) {
    out.push({ year: y, month: m });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
function personsLine(b) {
  if (b.adults_count != null || b.children_count != null) {
    const parts = [`${b.adults_count ?? 0} vuxna`, `${b.children_count ?? 0} barn`];
    if (b.pets_count) parts.push(`${b.pets_count} husdjur`);
    return parts.join(', ');
  }
  return `${b.guests_count} gäster`;
}

function BookingCard({ b }) {
  const s = st(b.status);
  const articles = (b.articles || []).filter(a => a.quantity > 0);
  const addons = b.addons || [];
  return (
    <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{b.guest_name}</div>
        <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4 }}>
        {b.booking_ref} · {b.date_from} – {b.date_to} · {b.nights} nätter
      </div>
      <div style={{ fontSize: 14, marginTop: 8 }}>👥 {personsLine(b)}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4 }}>
        ✉️ {b.guest_email}{b.guest_phone ? ` · 📞 ${b.guest_phone}` : ''}{b.guest_country ? ` · ${b.guest_country}` : ''}
      </div>
      {(articles.length > 0 || addons.length > 0) && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Tillägg</div>
          {articles.map((a, i) => (
            <div key={'a' + i}>• {a.name_sv} ×{a.quantity}{a.line_total ? ` (${kr(a.line_total)} kr)` : ''}</div>
          ))}
          {addons.map((ad, i) => (
            <div key={'ad' + i}>• Tilläggsbegäran ({st(ad.status).label}){ad.total_amount ? ` – ${kr(ad.total_amount)} kr` : ''}{ad.message ? `: ${ad.message}` : ''}</div>
          ))}
        </div>
      )}
      {b.message && (
        <div style={{ marginTop: 8, fontSize: 13, background: 'var(--sand)', borderRadius: 6, padding: '8px 10px' }}>
          <span style={{ fontWeight: 600 }}>Kundens meddelande:</span> {b.message}
        </div>
      )}
      {b.admin_note && (
        <div style={{ marginTop: 6, fontSize: 13, background: '#fff4e5', borderRadius: 6, padding: '8px 10px' }}>
          <span style={{ fontWeight: 600 }}>Admin-notering:</span> {b.admin_note}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>Totalt: {kr(b.total_amount)} kr</div>
    </div>
  );
}

export default function AdminCalendar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    adminApi.getCalendar()
      .then(r => setData(r.data))
      .catch(() => setData({ bookings: [], start: null, end: null }))
      .finally(() => setLoading(false));
  }, []);

  const bookings = data?.bookings || [];
  const bookingsOn = (dstr) => bookings.filter(b => dstr >= b.date_from && dstr < b.date_to);

  return (
    <AdminLayout title="Kalender">
      <Head><title>Kalender – Admin</title></Head>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['month', '🗓️ Månad'], ['list', '📋 Lista']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13,
            border: '1px solid var(--sand-dark)',
            background: view === v ? 'var(--water)' : 'white',
            color: view === v ? 'white' : 'var(--ink)',
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--ink-light)' }}>Laddar kalender…</div>}

      {!loading && bookings.length === 0 && (
        <div style={{ color: 'var(--ink-light)' }}>Inga bokningar i perioden.</div>
      )}

      {!loading && view === 'list' && bookings.length > 0 && (
        <div style={{ maxWidth: 640 }}>
          {[...bookings].sort((a, b) => a.date_from.localeCompare(b.date_from)).map(b => <BookingCard key={b.id} b={b} />)}
        </div>
      )}

      {!loading && view === 'month' && data?.start && (
        <div>
          {selected && (
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--sand)', paddingBottom: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--water)' }}>Stäng ×</button>
              </div>
              <div style={{ maxWidth: 640 }}><BookingCard b={selected} /></div>
            </div>
          )}
          {monthsBetween(data.start, data.end).map(({ year, month }) => (
            <div key={`${year}-${month}`} style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 12, textTransform: 'capitalize' }}>{MONTHS[month]} {year}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {WEEKDAYS.map(w => (
                  <div key={w} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-light)', textAlign: 'center', padding: '4px 0' }}>{w}</div>
                ))}
                {monthCells(year, month).map((cell, i) => {
                  if (!cell) return <div key={i} style={{ minHeight: 72 }} />;
                  const dstr = ymd(cell);
                  const occ = bookingsOn(dstr);
                  return (
                    <div key={i} style={{
                      minHeight: 72, border: '1px solid var(--sand-dark)', borderRadius: 6,
                      padding: 4, background: 'white', fontSize: 12, overflow: 'hidden',
                    }}>
                      <div style={{ color: 'var(--ink-light)', fontWeight: 600, marginBottom: 2 }}>{cell.getDate()}</div>
                      {occ.map(b => {
                        const s = st(b.status);
                        const addonCount = (b.articles || []).filter(a => a.quantity > 0).length + (b.addons || []).length;
                        return (
                          <div key={b.id} onClick={() => setSelected(b)} title="Klicka för detaljer" style={{
                            background: s.bg, color: s.color, borderRadius: 4, padding: '3px 5px',
                            marginBottom: 3, cursor: 'pointer', lineHeight: 1.25,
                          }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guest_name}</div>
                            <div style={{ fontSize: 11 }}>
                              👥{b.guests_count}{b.pets_count ? ` 🐾${b.pets_count}` : ''}{addonCount ? ` 🎁${addonCount}` : ''}
                            </div>
                            {(b.message || b.admin_note) && <div style={{ fontSize: 11 }}>💬</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
