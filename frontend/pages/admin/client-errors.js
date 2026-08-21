import { useState, useEffect, Fragment } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const CONTEXT_LABELS = {
  'price-check': 'Prisberäkning',
  'booking-submit': 'Skicka bokning',
  'addon-lookup': 'Hämta bokning (tillägg)',
  'addon-submit': 'Skicka tilläggsbegäran',
  'pay-lookup': 'Hämta betalningssida',
  'pay-stripe': 'Betalning – Stripe',
  'pay-paypal': 'Betalning – PayPal',
  'uncaught-js-error': 'Ofångat JS-fel',
  'unhandled-rejection': 'Ofångat promise-fel',
};

export default function ClientErrors() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi.listClientErrors(200)
      .then(r => setErrors(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm('Ta bort felrapporten?')) return;
    try {
      await adminApi.deleteClientError(id);
      setErrors(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      alert('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const fmtTime = (iso) => {
    if (!iso) return '–';
    const d = new Date(iso);
    return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'medium' });
  };

  return (
    <>
      <Head><title>Felrapporter — Admin Sjölyckan</title></Head>
      <AdminLayout title="Felrapporter">
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 16 }}>
          Fel som fångats i gästens webbläsare på bokningssidorna (bokning, tillägg, betalning) — användbart när en gäst rapporterar problem men inte kan beskriva vad som gick fel. Nyast överst.
        </p>

        {loading ? (
          <div style={{ color: 'var(--ink-pale)', fontSize: 13 }}>Laddar…</div>
        ) : errors.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', color: 'var(--ink-pale)', fontSize: 13 }}>
            Inga felrapporter registrerade. 🎉
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)' }}>
                  {['Tid', 'Typ', 'Meddelande', 'Gäst', 'Språk', ''].map(l => (
                    <th key={l} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errors.map(e => (
                  <Fragment key={e.id}>
                    <tr style={{ borderBottom: '1px solid var(--sand-dark)', cursor: 'pointer' }}
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--ink-light)' }}>{fmtTime(e.created_at)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: '#fdecea', color: '#c0392b', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                          {CONTEXT_LABELS[e.context] || e.context || 'Okänt'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message || '–'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-light)' }}>{e.guest_email || '–'}</td>
                      <td style={{ padding: '10px 14px' }}>{e.lang || '–'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={ev => { ev.stopPropagation(); del(e.id); }} title="Radera"
                          style={{ padding: '2px 7px', fontSize: 11, border: '1px solid #f5c6cb', borderRadius: 4, background: 'white', cursor: 'pointer', color: 'var(--red)' }}>
                          🗑
                        </button>
                      </td>
                    </tr>
                    {expanded === e.id && (
                      <tr style={{ borderBottom: '1px solid var(--sand-dark)' }}>
                        <td colSpan={6} style={{ padding: '14px', background: 'var(--sand)' }}>
                          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                            <div><strong>Sida:</strong> {e.url || '–'}</div>
                            <div><strong>Webbläsare:</strong> {e.user_agent || '–'}</div>
                            {e.extra && (
                              <div><strong>Extra:</strong> <code>{JSON.stringify(e.extra)}</code></div>
                            )}
                            {e.stack && (
                              <>
                                <div style={{ marginTop: 6 }}><strong>Stack:</strong></div>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: 'white', padding: 8, borderRadius: 6, border: '1px solid var(--sand-dark)', maxHeight: 200, overflowY: 'auto' }}>{e.stack}</pre>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminLayout>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
