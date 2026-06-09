import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import axios from 'axios';
import { adminApi } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const EMAIL_TYPE_LABELS = {
  booking_request: 'Bokningsförfrågan',
  booking_confirmed: 'Bekräftelse',
  booking_rejected: 'Nekad',
  booking_cancelled: 'Avbokad',
  payment_reminder: 'Betalningspåminnelse',
  checkin_info: 'Incheckningsinfo',
  admin_new_booking: 'Admin-avisering',
};

const STATUS_COLORS = {
  sent: { bg: '#d4edda', color: '#155724' },
  failed: { bg: '#f8d7da', color: '#721c24' },
};

export default function EmailLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const [resending, setResending] = useState(null);

  const resendLog = async (log) => {
    setResending(log.id);
    try {
      const res = await axios.post(`${API}/admin/email-logs/${log.id}/resend`, {}, {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
      });
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, status: 'sent', error: null } : l));
      alert('Mail skickat om till ' + (res.data?.recipient || log.recipient));
    } catch(e) {
      alert('Fel: ' + (e.response?.data?.detail || e.message));
    } finally {
      setResending(null);
    }
  };

  const deleteLog = async (id) => {
    try {
      await adminApi.deleteEmailLog(id);
      setLogs(l => l.filter(x => x.id !== id));
    } catch(e) { alert('Fel: ' + e.message); }
  };

  const deleteAll = async () => {
    try {
      await adminApi.deleteAllEmailLogs();
      setLogs([]);
    } catch(e) { alert('Fel: ' + e.message); }
  };

  useEffect(() => {
    axios.get(`${API}/admin/email-logs`, {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    }).then(r => setLogs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? logs.filter(l => l.email_type === filter || l.status === filter)
    : logs;

  return (
    <>
      <Head><title>E-postlogg — Admin Sjölyckan</title></Head>
      <AdminLayout title="E-postlogg">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['', 'sent', 'failed', 'booking_request', 'booking_confirmed', 'booking_rejected', 'booking_cancelled', 'payment_reminder', 'checkin_info'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 12px', borderRadius: 20, border: '1px solid var(--sand-dark)',
                background: filter === f ? 'var(--water)' : 'white',
                color: filter === f ? 'white' : 'var(--ink-light)',
                cursor: 'pointer', fontSize: 12,
              }}>
                {f === '' ? 'Alla' : f === 'sent' ? '✓ Skickade' : f === 'failed' ? '✗ Misslyckade' : EMAIL_TYPE_LABELS[f] || f}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-pale)' }}>{filtered.length} poster</span>
            <button onClick={deleteAll} style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #f5c6cb', borderRadius: 20, background: 'white', color: 'var(--red)', cursor: 'pointer' }}>
              🗑 Rensa alla
            </button>
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-pale)' }}>Laddar...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-pale)' }}>Inga poster</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)' }}>
                  {['Tidpunkt', 'Bokningsref', 'Gäst', 'Typ', 'Mottagare', 'Språk', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => {
                  const sc = STATUS_COLORS[log.status] || {};
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--sand)', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--sand)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>
                        {log.sent_at ? new Date(log.sent_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>{log.booking_ref}</td>
                      <td style={{ padding: '10px 14px' }}>{log.guest_name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: 'var(--water-pale)', color: 'var(--water)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500 }}>
                          {EMAIL_TYPE_LABELS[log.email_type] || log.email_type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-light)', fontSize: 12 }}>{log.recipient}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-light)', textTransform: 'uppercase', fontSize: 11 }}>{log.lang}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500 }}>
                          {log.status === 'sent' ? '✓ Skickat' : '✗ Fel'}
                        </span>
                        {log.error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{log.error}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => resendLog(log)} disabled={resending === log.id}
                          style={{ padding: '1px 6px', fontSize: 10, border: '1px solid var(--water)', borderRadius: 4, background: 'white', color: 'var(--water)', cursor: 'pointer' }}>
                          {resending === log.id ? '...' : '↩ Skicka om'}
                        </button>
                        <button onClick={() => deleteLog(log.id)} style={{ padding: '1px 6px', fontSize: 10, border: '1px solid #f5c6cb', borderRadius: 4, background: 'white', color: 'var(--red)', cursor: 'pointer' }}>
                          🗑
                        </button>
                      </div>
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
