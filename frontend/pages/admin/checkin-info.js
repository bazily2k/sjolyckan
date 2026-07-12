import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const empty = { title_sv:'', title_en:'', title_de:'', body_sv:'', body_en:'', body_de:'', icon:'', item_type:'static', active:true, sort_order:0 };

function Field({ label, field, type='text', half, select, options, form, setForm }) {
  return (
    <div style={{ gridColumn: half ? 'auto' : 'span 2' }}>
      <label style={lbl}>{label}</label>
      {select ? (
        <select value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={inp}>
          {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={type} value={form[field] ?? ''} onChange={e => setForm(f => ({ ...f, [field]: type==='number' ? Number(e.target.value) : e.target.value }))} style={inp} />
      )}
    </div>
  );
}

function formatErr(e) {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map(x => (Array.isArray(x.loc) ? x.loc[x.loc.length-1]+': ' : '') + (x.msg||'')).join('; ');
  if (typeof d === 'string') return d;
  return e?.message || 'Okänt fel';
}

export default function AdminCheckinInfo() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => adminApi.listCheckinInfo().then(r => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title_sv.trim()) { setMsg('Fel: Svensk rubrik krävs.'); return; }
    try {
      if (editing) await adminApi.updateCheckinInfo(editing, form);
      else await adminApi.createCheckinInfo(form);
      setMsg('Sparat!'); setForm(empty); setEditing(null); load();
    } catch (e) { setMsg('Fel: ' + formatErr(e)); }
  };

  return (
    <>
      <Head><title>Incheckningsinfo — Admin Sjölyckan</title></Head>
      <AdminLayout title="Incheckningsinfo">
        <p style={{ fontSize:13, color:'var(--ink-light)', marginBottom:16 }}>
          Infopunkter som visas i incheckningsmejlet (dagen före ankomst). Statiska punkter är samma för alla; kod-punkter fylls i per bokning och visas bara om ett värde angetts.
        </p>
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={closeBtn}>×</button></div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          {/* Lista */}
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--sand-dark)', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--sand)', borderBottom:'1px solid var(--sand-dark)' }}>
                  {['Rubrik','Typ','Aktiv',''].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:500, color:'var(--ink-light)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={4} style={{ padding:'14px', color:'var(--ink-pale)' }}>Inga infopunkter ännu.</td></tr>}
                {items.map(it => (
                  <tr key={it.id} style={{ borderBottom:'1px solid var(--sand)', opacity: it.active ? 1 : 0.4 }}>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{it.icon} {it.title_sv}</td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-pale)' }}>{it.item_type === 'code' ? 'Kod (per bokning)' : 'Statisk'}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <button onClick={() => adminApi.toggleCheckinInfo(it.id).then(load)} style={{ ...togBtn, background: it.active ? '#d4edda' : '#f8d7da', color: it.active ? '#155724' : '#721c24' }}>
                        {it.active ? '✓ Aktiv' : '✗ Av'}
                      </button>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditing(it.id); setForm({...it}); }} style={actionBtn}>Redigera</button>
                        <button onClick={() => { if (confirm('Ta bort denna infopunkt?')) adminApi.deleteCheckinInfo(it.id).then(load); }} style={{ ...actionBtn, color:'var(--red)' }}>Ta bort</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Formulär */}
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', padding:20, position:'sticky', top:80 }}>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:16 }}>
              {editing ? 'Redigera infopunkt' : 'Lägg till infopunkt'}
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field form={form} setForm={setForm} label="Ikon (emoji)" field="icon" half />
              <Field form={form} setForm={setForm} label="Typ" field="item_type" half select options={[
                { v:'static', l:'Statisk text' },
                { v:'code', l:'Kod (per bokning)' },
              ]} />
              <Field form={form} setForm={setForm} label="Rubrik (svenska)" field="title_sv" />
              <Field form={form} setForm={setForm} label="Rubrik (engelska)" field="title_en" />
              <Field form={form} setForm={setForm} label="Rubrik (tyska)" field="title_de" />
              <Field form={form} setForm={setForm} label="Text (svenska)" field="body_sv" />
              <Field form={form} setForm={setForm} label="Text (engelska)" field="body_en" />
              <Field form={form} setForm={setForm} label="Text (tyska)" field="body_de" />
              <Field form={form} setForm={setForm} label="Sorteringsordning" field="sort_order" type="number" half />
            </div>
            {form.item_type === 'code' &&
              <div style={{ fontSize:12, color:'var(--ink-light)', marginTop:8, background:'var(--sand)', padding:'8px 10px', borderRadius:'var(--radius-md)' }}>
                Ett kodfält visas på varje bokning. Punkten kommer bara med i mejlet om du fyllt i ett värde för den bokningen.
              </div>}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))} />
                Aktiv (kommer med i mejlet)
              </label>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              {editing && <button onClick={() => { setEditing(null); setForm(empty); }} style={{ ...saveBtn, background:'var(--sand)', color:'var(--ink)' }}>Avbryt</button>}
              <button onClick={save} style={saveBtn}>{editing ? 'Spara' : 'Lägg till'}</button>
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const lbl = { fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', display:'block', marginBottom:3 };
const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' };
const saveBtn = { flex:1, padding:'9px 0', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, fontWeight:500 };
const actionBtn = { padding:'4px 10px', border:'1px solid var(--sand-dark)', background:'white', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12, color:'var(--ink-light)' };
const togBtn = { padding:'3px 8px', border:'none', borderRadius:20, cursor:'pointer', fontSize:11, fontWeight:500 };
const msgBox = { background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'10px 16px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' };
const closeBtn = { border:'none', background:'none', cursor:'pointer', fontSize:16 };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
