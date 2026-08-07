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
const BLOCK_BG = '#f1d9d9';
const BLOCK_FG = '#7d2b2b';
const AGENT_BG = '#e0d4f0';
const AGENT_FG = '#4b2e78';
const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

const st = (s) => STATUS[s] || { bg: '#eee', color: '#333', label: s };
const kr = (n) => (n || 0).toLocaleString('sv-SE');

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
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
// En bokning belägger: ankomstdag = eftermiddag, mellandagar = hela dygnet,
// avresedag = förmiddag (gästen lämnar kl 12).
function occupiesMorning(b, dstr) {
  return dstr > b.date_from && dstr <= b.date_to;
}
function occupiesAfternoon(b, dstr) {
  return dstr >= b.date_from && dstr < b.date_to;
}
function phaseLabel(b, dstr) {
  if (dstr === b.date_from) return '→ Ankomst';
  if (dstr === b.date_to) return '← Avresa (till 12:00)';
  return null;
}

// Generisk bakgrund/text-färg/etikett för både riktiga bokningar och
// blockerade/förmedlar-poster, så de kan blandas i samma diagonal-logik.
function bgOf(e) {
  if (e._type === 'blocked') return e.agent_name ? AGENT_BG : BLOCK_BG;
  return st(e.status).bg;
}
function fgOf(e) {
  if (e._type === 'blocked') return e.agent_name ? AGENT_FG : BLOCK_FG;
  return st(e.status).color;
}
function shortLabel(e) {
  if (e._type === 'blocked') return e.agent_name || 'Blockerad';
  return e.guest_name;
}

// Rena blockeringar (utan förmedlare, t.ex. "stängt hus") representerar ingen
// verklig gäst-in/utcheckning, så de ska alltid täcka hela dagen (fm+em) i sin
// helhet — bara förmedlar-bokningar (som är riktiga gästvistelser) och riktiga
// bokningar deltar i ankomst/avrese-uppdelningen.
function entryOccupiesMorning(e, dstr) {
  if (e._type === 'blocked' && !e.agent_name) return dstr >= e.date_from && dstr < e.date_to;
  return occupiesMorning(e, dstr);
}
function entryOccupiesAfternoon(e, dstr) {
  if (e._type === 'blocked' && !e.agent_name) return dstr >= e.date_from && dstr < e.date_to;
  return occupiesAfternoon(e, dstr);
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
    <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{b.guest_name}</div>
        <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '3px 12px', fontSize: 13, fontWeight: 600 }}>{s.label}</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 5 }}>
        {b.booking_ref} · {b.nights} nätter
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>
        → Ankomst <strong>{b.date_from}</strong> (från 15:00) &nbsp;·&nbsp; ← Avresa <strong>{b.date_to}</strong> (till 12:00)
      </div>
      <div style={{ fontSize: 15, marginTop: 9 }}>👥 {personsLine(b)}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 5 }}>
        ✉️ {b.guest_email}{b.guest_phone ? ` · 📞 ${b.guest_phone}` : ''}{b.guest_country ? ` · ${b.guest_country}` : ''}
      </div>
      {(articles.length > 0 || addons.length > 0) && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>Tillägg</div>
          {articles.map((a, i) => (
            <div key={'a' + i}>• {a.name_sv} ×{a.quantity}{a.line_total ? ` (${kr(a.line_total)} kr)` : ''}</div>
          ))}
          {addons.map((ad, i) => (
            <div key={'ad' + i}>• Tilläggsbegäran ({st(ad.status).label}){ad.total_amount ? ` – ${kr(ad.total_amount)} kr` : ''}{ad.message ? `: ${ad.message}` : ''}</div>
          ))}
        </div>
      )}
      {b.message && (
        <div style={{ marginTop: 10, fontSize: 14, background: 'var(--sand)', borderRadius: 6, padding: '10px 12px' }}>
          <span style={{ fontWeight: 600 }}>Kundens meddelande:</span> {b.message}
        </div>
      )}
      {b.admin_note && (
        <div style={{ marginTop: 7, fontSize: 14, background: '#fff4e5', borderRadius: 6, padding: '10px 12px' }}>
          <span style={{ fontWeight: 600 }}>Admin-notering:</span> {b.admin_note}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>Totalt: {kr(b.total_amount)} kr</div>
    </div>
  );
}

function BlockedFilesList({ files }) {
  if (!files || files.length === 0) return null;
  const fileIcon = (filename) => {
    const ext = (filename || '').split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📕';
    if (ext === 'doc' || ext === 'docx') return '📘';
    if (ext === 'eml' || ext === 'msg') return '✉️';
    return '📎';
  };
  return (
    <div style={{ marginTop: 9, fontSize: 15 }}>
      <span style={{ fontWeight: 600 }}>Bifogade filer:</span>
      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
        {files.map(f => (
          <li key={f.id} style={{ fontSize: 14 }}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--water)' }}>
              {fileIcon(f.filename)} {f.filename}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockedCard({ bl }) {
  if (bl.agent_name) {
    return (
      <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderLeft: `4px solid ${AGENT_FG}`, borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>🤝 Förmedlar-bokning – {bl.agent_name}</div>
        <div style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 5 }}>{bl.date_from} – {bl.date_to}</div>
        {bl.guest_name && <div style={{ marginTop: 9, fontSize: 15 }}><span style={{ fontWeight: 600 }}>Gäst:</span> {bl.guest_name}</div>}
        {bl.guest_email && <div style={{ marginTop: 4, fontSize: 14 }}><span style={{ fontWeight: 600 }}>E-post:</span> {bl.guest_email}</div>}
        {bl.guest_phone && <div style={{ marginTop: 4, fontSize: 14 }}><span style={{ fontWeight: 600 }}>Telefon:</span> {bl.guest_phone}</div>}
        {bl.guest_country && <div style={{ marginTop: 4, fontSize: 14 }}><span style={{ fontWeight: 600 }}>Land:</span> {bl.guest_country}</div>}
        {(bl.adults_count != null || bl.children_count != null || bl.pets_count != null) && (
          <div style={{ marginTop: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>Gäster:</span> {bl.adults_count ?? 0} vuxna
            {bl.children_count ? `, ${bl.children_count} barn` : ''}
            {bl.pets_count ? `, ${bl.pets_count} husdjur` : ''}
          </div>
        )}
        {(bl.articles || []).filter(a => (a.quantity || 0) > 0).length > 0 && (
          <div style={{ marginTop: 9, fontSize: 15 }}>
            <span style={{ fontWeight: 600 }}>Tillägg:</span>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {bl.articles.filter(a => (a.quantity || 0) > 0).map((a, ix) => (
                <li key={ix} style={{ fontSize: 14 }}>{a.name_sv}{a.quantity > 1 ? ` ×${a.quantity}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        {bl.reason && <div style={{ marginTop: 9, fontSize: 15 }}><span style={{ fontWeight: 600 }}>Kommentar (syns i kalendern):</span> {bl.reason}</div>}
        {bl.internal_note && <div style={{ marginTop: 7, fontSize: 14, background: '#fff4e5', borderRadius: 6, padding: '10px 12px' }}><span style={{ fontWeight: 600 }}>🔒 Intern anteckning (syns ej i kalendern):</span> {bl.internal_note}</div>}
        <BlockedFilesList files={bl.files} />
      </div>
    );
  }
  return (
    <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderLeft: '4px solid #c0392b', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>🚫 Blockerad period</div>
      <div style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 5 }}>{bl.date_from} – {bl.date_to}</div>
      {bl.reason && <div style={{ marginTop: 9, fontSize: 15 }}><span style={{ fontWeight: 600 }}>Kommentar (syns i kalendern):</span> {bl.reason}</div>}
      {bl.internal_note && <div style={{ marginTop: 7, fontSize: 14, background: '#fff4e5', borderRadius: 6, padding: '10px 12px' }}><span style={{ fontWeight: 600 }}>🔒 Intern anteckning (syns ej i kalendern):</span> {bl.internal_note}</div>}
      <BlockedFilesList files={bl.files} />
    </div>
  );
}

export default function AdminCalendar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  // På mobil (stående) är listvyn läsbar; månadsrutnätet blir för trångt.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setView('list');
  }, []);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    adminApi.getCalendar()
      .then(r => setData(r.data))
      .catch(() => setData({ bookings: [], blocked: [], start: null, end: null }))
      .finally(() => setLoading(false));
  }, []);

  const bookings = data?.bookings || [];
  const blocked = data?.blocked || [];
  // Tagga varje post med _type så diagonal-rendern kan avgöra hur den ska visas,
  // och slå ihop dem i samma pool så blockerade/förmedlar-datum får samma
  // ankomst/avresa-triangel-uppdelning som riktiga bokningar.
  const allEntries = [
    ...bookings.map(b => ({ ...b, _type: 'booking' })),
    ...blocked.map(bl => ({ ...bl, _type: 'blocked' })),
  ];
  const morningOn = (dstr) => allEntries.filter(e => entryOccupiesMorning(e, dstr));
  const afternoonOn = (dstr) => allEntries.filter(e => entryOccupiesAfternoon(e, dstr));

  const listItems = [
    ...bookings.map(b => ({ key: 'b' + b.id, date: b.date_from, node: <BookingCard b={b} /> })),
    ...blocked.map(bl => ({ key: 'x' + bl.id, date: bl.date_from, node: <BlockedCard bl={bl} /> })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <AdminLayout title="Kalender">
      <Head><title>Kalender – Admin</title></Head>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['month', '🗓️ Månad'], ['list', '📋 Lista']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '9px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 14,
            border: '1px solid var(--sand-dark)',
            background: view === v ? 'var(--water)' : 'white',
            color: view === v ? 'white' : 'var(--ink)',
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--ink-light)' }}>Laddar kalender…</div>}

      {!loading && bookings.length === 0 && blocked.length === 0 && (
        <div style={{ color: 'var(--ink-light)' }}>Inga bokningar eller blockerade datum i perioden.</div>
      )}

      {!loading && view === 'list' && listItems.length > 0 && (
        <div style={{ maxWidth: 660 }}>
          {listItems.map(it => <div key={it.key}>{it.node}</div>)}
        </div>
      )}

      {!loading && view === 'month' && data?.start && (
        <div>
          {selected && (
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--sand)', paddingBottom: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--water)' }}>Stäng ×</button>
              </div>
              <div style={{ maxWidth: 660 }}>
                {selected._type === 'blocked' ? <BlockedCard bl={selected} /> : <BookingCard b={selected} />}
              </div>
            </div>
          )}
          {monthsBetween(data.start, data.end).map(({ year, month }) => (
            <div key={`${year}-${month}`} style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 14, textTransform: 'capitalize' }}>{MONTHS[month]} {year}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                {WEEKDAYS.map(w => (
                  <div key={w} style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-light)', textAlign: 'center', padding: '6px 0' }}>{w}</div>
                ))}
                {monthCells(year, month).map((cell, i) => {
                  if (!cell) return <div key={i} style={{ minHeight: 132 }} />;
                  const dstr = ymd(cell);
                  const morn = morningOn(dstr);
                  const aft = afternoonOn(dstr);
                  // Heldag = exakt samma poster (bokning ELLER block) täcker både fm och em (ingen växling)
                  const ids = arr => arr.map(e => `${e._type}${e.id}`).sort().join(',');
                  const isFullDay = morn.length > 0 && ids(morn) === ids(aft);

                  // Diagonal design: övre vänster triangel = avresa (fm),
                  // nedre höger triangel = ankomst (em). Heldag = fylld ruta.
                  // Gäller lika för riktiga bokningar och blockerade/förmedlar-poster.
                  const mornB = morn[0];
                  const aftB = aft[0];
                  const mornBg = mornB ? bgOf(mornB) : null;
                  const aftBg = aftB ? bgOf(aftB) : null;
                  const short = (n) => (n || '').split(' ')[0];

                  // Innehåll för en post (bokning eller block) i "heldags"-läge (normalt flöde, kan växa)
                  const fullDayContent = (e) => e._type === 'blocked' ? (
                    e.agent_name ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>🤝 {e.agent_name}</div>
                        {e.guest_name && <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.guest_name}</div>}
                        {(e.adults_count != null || e.pets_count) && (
                          <div style={{ fontSize: 13, marginTop: 2 }}>
                            👥{e.adults_count ?? 0}{e.children_count ? `+${e.children_count}` : ''}{e.pets_count ? ` 🐾${e.pets_count}` : ''}
                          </div>
                        )}
                        {(e.articles || []).filter(a => (a.quantity || 0) > 0).length > 0 && (
                          <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.3 }}>
                            {e.articles.filter(a => (a.quantity || 0) > 0).map((a, ix) => (
                              <div key={ix} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                🎁 {a.name_sv}{a.quantity > 1 ? ` ×${a.quantity}` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                        {e.reason && <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>💬 {e.reason}</div>}
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>🚫 Blockerad</div>
                        {e.reason && <div style={{ fontSize: 12, lineHeight: 1.3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>💬 {e.reason}</div>}
                      </>
                    )
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{e.guest_name}</div>
                      <div style={{ fontSize: 13, marginTop: 2 }}>
                        👥{e.guests_count}{e.pets_count ? ` 🐾${e.pets_count}` : ''}
                      </div>
                      {(() => {
                        const items = [];
                        (e.articles || []).filter(a => (a.quantity || 0) > 0).forEach(a => items.push({ name: a.name_sv, qty: a.quantity }));
                        (e.addons || []).forEach(ad => (ad.articles || []).forEach(a => items.push({ name: a.name_sv, qty: a.quantity })));
                        if (items.length === 0) return null;
                        return (
                          <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.3 }}>
                            {items.map((it, ix) => (
                              <div key={ix} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                🎁 {it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {(e.message || e.admin_note) && <div style={{ fontSize: 13, marginTop: 2 }}>💬</div>}
                    </>
                  );

                  const titleFor = (e, phase) => {
                    if (e._type === 'blocked') {
                      const label = e.agent_name ? `Förmedlar-bokning – ${e.agent_name}` : 'Blockerad';
                      return phase ? `${label} – ${phase}` : `${label} – klicka för detaljer`;
                    }
                    return phase ? `${e.guest_name} – ${phase}` : 'Klicka för detaljer';
                  };

                  return (
                    <div key={i} style={{
                      position: 'relative', minHeight: 132, border: '1px solid var(--sand-dark)',
                      borderRadius: 6, background: 'white', fontSize: 15, overflow: 'hidden',
                    }}>
                      {isFullDay && mornB ? (
                        /* Heldag: fylld ruta med max info — normalt flöde så den kan växa */
                        <div onClick={() => setSelected(mornB)} title={titleFor(mornB)} style={{
                          minHeight: '100%', background: mornBg, color: fgOf(mornB),
                          cursor: 'pointer', padding: 6, display: 'flex', flexDirection: 'column',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 18 }}>{cell.getDate()}</div>
                          {fullDayContent(mornB)}
                        </div>
                      ) : (
                        <>
                          {/* Övre vänster triangel = avresa (fm) */}
                          {mornB && (
                            <div onClick={() => setSelected(mornB)} title={titleFor(mornB, 'avresa')} style={{
                              position: 'absolute', inset: 0, background: mornBg,
                              clipPath: 'polygon(0 0, 100% 0, 0 100%)', cursor: 'pointer',
                            }} />
                          )}
                          {/* Nedre höger triangel = ankomst (em) */}
                          {aftB && (
                            <div onClick={() => setSelected(aftB)} title={titleFor(aftB, 'ankomst')} style={{
                              position: 'absolute', inset: 0, background: aftBg,
                              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)', cursor: 'pointer',
                            }} />
                          )}
                          {/* Tydlig skiljelinje mellan avresa/ankomst-trianglarna (dubbel linje: vit yttre
                              för kontrast mot mörka bakgrunder, mörk inre för kontrast mot ljusa) */}
                          {mornB && aftB && (
                            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                              viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line x1="100" y1="0" x2="0" y2="100" stroke="white" strokeWidth="4.5" vectorEffect="non-scaling-stroke" />
                              <line x1="100" y1="0" x2="0" y2="100" stroke="rgba(0,0,0,0.45)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                            </svg>
                          )}
                          {/* Datum uppe till vänster */}
                          <div style={{ position: 'absolute', top: 4, left: 6, fontWeight: 600, fontSize: 18, color: 'var(--ink-light)', pointerEvents: 'none' }}>{cell.getDate()}</div>
                          {/* Avresetext (uppe vänster, under datum) */}
                          {mornB && (
                            <div style={{ position: 'absolute', top: 26, left: 6, fontSize: 12, fontWeight: 600, color: fgOf(mornB), lineHeight: 1.15, pointerEvents: 'none', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {short(shortLabel(mornB))}<br /><span style={{ fontWeight: 700, fontSize: 9, letterSpacing: 0.3 }}>UTCHECKNING</span>
                            </div>
                          )}
                          {/* Ankomsttext (nere höger) */}
                          {aftB && (
                            <div style={{ position: 'absolute', bottom: 5, right: 6, fontSize: 12, fontWeight: 600, color: fgOf(aftB), lineHeight: 1.15, textAlign: 'right', pointerEvents: 'none', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {short(shortLabel(aftB))}<br /><span style={{ fontWeight: 700, fontSize: 9, letterSpacing: 0.3 }}>INCHECKNING</span>
                            </div>
                          )}
                          {/* Helt ledig dag */}
                          {!mornB && !aftB && (
                            <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: 'var(--sand-dark)', pointerEvents: 'none' }}>ledig</div>
                          )}
                        </>
                      )}
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
