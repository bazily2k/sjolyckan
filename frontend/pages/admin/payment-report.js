import { useState, useEffect, useMemo } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const STATUS_LABELS = {
  pending: 'Förfrågan',
  confirmed: 'Bekräftad',
  deposit_paid: 'Handpenning betald',
  partially_paid: 'Delbetald',
  paid: 'Fullbetald',
  cancelled: 'Avbokad',
  expired: 'Utgången',
  pending_email_verify: 'Väntar e-postbekräftelse',
};

const STATUS_COLORS = {
  pending: { bg: '#fff3cd', color: '#856404' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  deposit_paid: { bg: '#d1ecf1', color: '#0c5460' },
  partially_paid: { bg: '#d1ecf1', color: '#0c5460' },
  paid: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
  expired: { bg: '#f8d7da', color: '#721c24' },
  pending_email_verify: { bg: '#e2e3e5', color: '#383d41' },
};

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('sv-SE');
}

function fmtAmount(a) {
  if (a === null || a === undefined) return '–';
  return a.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export default function PaymentReportPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilter] = useState('unpaid'); // 'all' | 'unpaid'

  const load = () => {
    setLoading(true);
    adminApi.getPaymentReport(showHidden)
      .then(r => setRows(r.data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showHidden]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'unpaid') {
      list = list.filter(r => !r.final_paid && r.status !== 'cancelled' && r.status !== 'expired');
    }
    return list;
  }, [rows, filter]);

  return (
    <>
      <Head><title>Betalningsrapport — Admin Sjölyckan</title></Head>
      <AdminLayout title="Betalningsrapport">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['unpaid', 'Obetalda'], ['all', 'Alla bokningar']].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: '5px 12px', borderRadius: 20, border: '1px solid var(--sand-dark)',
                background: filter === key ? 'var(--water)' : 'white',
                color: filter === key ? 'white' : 'var(--ink-light)',
                cursor: 'pointer', fontSize: 12,
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--ink-light)', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
              Visa dolda
            </label>
            <span style={{ fontSize: 13, color: 'var(--ink-pale)' }}>{filtered.length} bokningar</span>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-pale)' }}>Laddar...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-pale)' }}>Inga bokningar</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)' }}>
                  {['Ref', 'Gäst', 'Ankomst', 'Avresa', 'Belopp', 'Status', 'Förfaller', 'Betaldatum', 'Påminnelse 1', 'Påminnelse 2', 'Påminnelse skickad?'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const sc = STATUS_COLORS[r.status] || {};
                  const dLeft = daysUntil(r.payment_due_date);
                  const overdue = !r.final_paid && dLeft !== null && dLeft < 0 && r.status !== 'cancelled' && r.status !== 'expired';
                  return (
                    <tr key={r.booking_id} style={{ borderBottom: '1px solid var(--sand)', background: overdue ? '#fff5f5' : 'white' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{r.booking_ref}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{r.guest_name}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.date_from)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.date_to)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtAmount(r.total_amount)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                        {r.final_paid && (
                          <div style={{ fontSize: 10, color: 'var(--ink-pale)', marginTop: 2 }}>✓ Betald</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: overdue ? 600 : 400, color: overdue ? 'var(--red)' : 'inherit' }}>
                        {fmtDate(r.payment_due_date)}
                        {overdue && <div style={{ fontSize: 10 }}>Förfallen</div>}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: r.paid_at ? 'var(--ink)' : 'var(--ink-pale)' }}>
                        {r.paid_at ? fmtDate(r.paid_at) : '–'}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.reminder_1_date)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.reminder_2_date)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500,
                          background: r.reminder_sent ? '#d4edda' : '#f1f1f1',
                          color: r.reminder_sent ? '#155724' : 'var(--ink-pale)',
                        }}>
                          {r.reminder_sent ? '✓ Skickad' : '✗ Ej skickad'}
                        </span>
                        {r.reminder_sent && r.reminder_sent_at && (
                          <div style={{ fontSize: 10, color: 'var(--ink-pale)', marginTop: 2 }}>{fmtDate(r.reminder_sent_at)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
