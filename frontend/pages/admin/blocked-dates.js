import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
const getHeaders = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });

export default function BlockedDatesPage() {
  const [blocks, setBlocks] = useState([]);
  const [form, setForm] = useState({ date_from: '', date_to: '', reason: '' });
  const [msg, setMsg] = useState('');

  const load = () => axios.get(`${API}/admin/blocked-dates`, { headers: getHeaders() })
    .then(r => setBlocks(r.data)).catch(() => {});

  useEffect(() => { load(); }, []);

  const save = async () => {
    console.log('save called', form);
    if (!form.date_from || !form.date_to) { setMsg('Ange från- och till-datum'); return; }
    if (form.date_to <= form.date_from) { setMsg('Till-datum måste vara efter från-datum'); return; }
    try {
      await axios.post(`${API}/admin/blocked-dates`, form, { headers: getHeaders() });
      setMsg('Datum blockerat!');
      setForm({ date_from: '', date_to: '', reason: '' });
      load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    try {
      await axios.delete(`${API}/admin/blocked-dates/${id}`, { headers: getHeaders() });
      setBlocks(b => b.filter(x => x.id !== id));
    } catch(e) { alert('Fel: ' + e.message); }
  };

  return (
    <>
      <Head><title>Blockerade datum — Admin Sjölyckan</title></Head>
      <AdminLayout title="Blockerade datum">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={{ border:'none', background:'none', cursor:'pointer' }}>×</button></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          {/* Lista */}
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'hidden' }}>
            {blocks.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-pale)' }}>Inga blockerade datum</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)' }}>
                    {['Från', 'Till', 'Anledning', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-light)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blocks.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--sand)' }}>
                      <td style={{ padding: '10px 14px' }}>{b.date_from}</td>
                      <td style={{ padding: '10px 14px' }}>{b.date_to}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-light)' }}>{b.reason || '–'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => remove(b.id)} style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #f5c6cb', borderRadius: 'var(--radius-md)', background: 'white', color: 'var(--red)', cursor: 'pointer' }}>
                          Ta bort
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Lägg till */}
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, marginBottom: 16 }}>Blockera datum</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Från datum</label>
              <input type="date" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} style={inp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Till datum (ej inkluderat)</label>
              <input type="date" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} style={inp} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Anledning (valfritt)</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="t.ex. Underhåll, Privat vistelse" style={inp} />
            </div>
            <button onClick={save} style={{ width: '100%', padding: 10, background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
              Blockera datum
            </button>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const lbl = { fontSize: 11, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 3 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none' };
const msgBox = { background: 'var(--water-pale)', border: '1px solid var(--water)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
