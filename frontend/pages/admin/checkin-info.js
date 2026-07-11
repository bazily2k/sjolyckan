import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const EMPTY = { title_sv:'', title_en:'', title_de:'', body_sv:'', body_en:'', body_de:'', icon:'', active:true, sort_order:0 };

export default function CheckinInfoAdmin() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try { const r = await adminApi.listCheckinInfo(); setItems(r.data || []); } catch (e) { setMsg('Kunde inte hämta.'); }
  };
  useEffect(() => { load(); }, []);

  const edit = (it) => { setEditingId(it.id); setForm({ ...EMPTY, ...it }); setMsg(''); };
  const cancel = () => { setEditingId(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.title_sv.trim()) { setMsg('Svensk rubrik krävs.'); return; }
    try {
      if (editingId) await adminApi.updateCheckinInfo(editingId, form);
      else await adminApi.createCheckinInfo(form);
      setMsg('Sparat.'); cancel(); await load();
    } catch (e) { setMsg('Kunde inte spara.'); }
  };
  const toggle = async (id) => { await adminApi.toggleCheckinInfo(id); await load(); };
  const remove = async (id) => { if (!confirm('Ta bort denna infopunkt permanent?')) return; await adminApi.deleteCheckinInfo(id); await load(); };

  const field = (label, key, area) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>{label}</div>
      {area
        ? <textarea value={form[key]} rows={2} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, fontFamily:'inherit', resize:'vertical' }} />
        : <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14 }} />}
    </div>
  );

  return (
    <>
      <Head><title>Incheckningsinfo — Admin Sjölyckan</title></Head>
      <AdminLayout title="Incheckningsinfo">
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 16 }}>
          Egna infopunkter som visas i incheckningsmailet (dagen före ankomst). Endast aktiva punkter kommer med.
        </p>

        {msg && <div style={{ background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'8px 14px', marginBottom:14, fontSize:13 }}>{msg}</div>}

        <div style={{ display:'grid', gap:16, gridTemplateColumns:'1fr 1fr', alignItems:'start' }}>
          <div>
            {items.length === 0 && <p style={{ fontSize:13, color:'var(--ink-pale)' }}>Inga punkter ännu.</p>}
            {items.map(it => (
              <div key={it.id} style={{ border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', padding:12, marginBottom:10, background: it.active ? 'white' : 'var(--sand)', opacity: it.active ? 1 : 0.6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                  <strong style={{ fontSize:14 }}>{it.icon} {it.title_sv}</strong>
                  <span style={{ fontSize:11, color: it.active ? '#2e7d32' : 'var(--ink-pale)' }}>{it.active ? 'Aktiv' : 'Av'}</span>
                </div>
                {it.body_sv && <div style={{ fontSize:12, color:'var(--ink-light)', marginTop:4 }}>{it.body_sv}</div>}
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button onClick={() => edit(it)} style={btn}>Redigera</button>
                  <button onClick={() => toggle(it.id)} style={btn}>{it.active ? 'Inaktivera' : 'Aktivera'}</button>
                  <button onClick={() => remove(it.id)} style={{ ...btn, color:'#c0392b' }}>Ta bort</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', padding:16, background:'white' }}>
            <h3 style={{ fontSize:15, marginTop:0, marginBottom:12 }}>{editingId ? 'Redigera punkt' : 'Ny punkt'}</h3>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ width:90 }}>{field('Ikon (emoji)', 'icon')}</div>
              <div style={{ flex:1 }}>{field('Rubrik (SV) *', 'title_sv')}</div>
            </div>
            {field('Text (SV)', 'body_sv', true)}
            <details style={{ marginBottom:10 }}>
              <summary style={{ fontSize:12, color:'var(--ink-light)', cursor:'pointer' }}>Engelska & tyska (valfritt)</summary>
              <div style={{ marginTop:8 }}>
                {field('Rubrik (EN)', 'title_en')}{field('Text (EN)', 'body_en', true)}
                {field('Rubrik (DE)', 'title_de')}{field('Text (DE)', 'body_de', true)}
              </div>
            </details>
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:12 }}>
              <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Aktiv
              </label>
              <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                Ordning <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  style={{ width:60, padding:'4px 8px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)' }} />
              </label>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} style={{ ...btn, background:'var(--water)', color:'white', border:'none' }}>{editingId ? 'Spara' : 'Lägg till'}</button>
              {editingId && <button onClick={cancel} style={btn}>Avbryt</button>}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const btn = { padding:'6px 12px', background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
