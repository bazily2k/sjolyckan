import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const ICONS = ['ti-package','ti-flame','ti-anchor','ti-ripple','ti-bed','ti-wash','ti-tools-kitchen-2','ti-trees','ti-bike','ti-fish','ti-umbrella-beach'];
const empty = { name_sv:'', name_en:'', name_de:'', desc_sv:'', desc_en:'', desc_de:'', price:'', price_type:'per_night', icon:'ti-package', visible:true, bookable:true, is_deposit:false, is_pet_fee:false, sort_order:0, active:true };

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
  if (Array.isArray(d)) {
    return d.map(x => {
      const field = Array.isArray(x.loc) ? x.loc[x.loc.length - 1] : '';
      return (field ? field + ': ' : '') + (x.msg || '');
    }).join('; ');
  }
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') return d.msg || JSON.stringify(d);
  return e?.message || 'Okänt fel';
}

export default function AdminArticles() {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => adminApi.listArticles().then(r => setArticles(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (form.price === '' || form.price === null || isNaN(Number(form.price))) {
      setMsg('Fel: Ange ett giltigt pris.'); return;
    }
    try {
      if (editing) {
        await adminApi.updateArticle(editing, form);
      } else {
        await adminApi.createArticle(form);
      }
      setMsg('Sparat!'); setForm(empty); setEditing(null); load();
    } catch (e) {
      setMsg('Fel: ' + formatErr(e));
    }
  };

  return (
    <>
      <Head><title>Tillägg — Admin Sjölyckan</title></Head>
      <AdminLayout title="Tillägg">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={closeBtn}>×</button></div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          {/* Lista */}
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--sand-dark)', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--sand)', borderBottom:'1px solid var(--sand-dark)' }}>
                  {['Namn','Pris','Typ','Synlig','Bokningsbar',''].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:500, color:'var(--ink-light)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articles.map(a => (
                  <tr key={a.id} style={{ borderBottom:'1px solid var(--sand)', opacity: a.active ? 1 : 0.4 }}>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{a.name_sv}</td>
                    <td style={{ padding:'10px 14px' }}>{a.price} kr</td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-pale)' }}>{a.price_type}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <button onClick={() => adminApi.toggleVisible(a.id).then(load)} style={{ ...togBtn, background: a.visible ? '#d4edda' : '#f8d7da', color: a.visible ? '#155724' : '#721c24' }}>
                        {a.visible ? '✓ Synlig' : '✗ Dold'}
                      </button>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <button onClick={() => adminApi.toggleBookable(a.id).then(load)} style={{ ...togBtn, background: a.bookable ? '#d4edda' : '#fff3cd', color: a.bookable ? '#155724' : '#856404' }}>
                        {a.bookable ? '✓ Bokningsbar' : '○ Ej bokningsbar'}
                      </button>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditing(a.id); setForm({...a}); }} style={actionBtn}>Redigera</button>
                        <button onClick={() => adminApi.deleteArticle(a.id).then(load)} style={{ ...actionBtn, color:'var(--red)' }}>Ta bort</button>
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
              {editing ? 'Redigera tillägg' : 'Lägg till tillägg'}
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field form={form} setForm={setForm} label="Namn (svenska)" field="name_sv" />
              <Field form={form} setForm={setForm} label="Namn (engelska)" field="name_en" />
              <Field form={form} setForm={setForm} label="Namn (tyska)" field="name_de" />
              <Field form={form} setForm={setForm} label="Beskrivning (sv)" field="desc_sv" />
              <Field form={form} setForm={setForm} label="Beskrivning (en)" field="desc_en" />
              <Field form={form} setForm={setForm} label="Beskrivning (de)" field="desc_de" />
              <Field form={form} setForm={setForm} label="Pris (kr)" field="price" type="number" half />
              <Field form={form} setForm={setForm} label="Pristyp" field="price_type" half select options={[
                { v:'per_night', l:'Per natt' },
                { v:'per_guest', l:'Per gäst' },
                { v:'per_occasion', l:'Per tillfälle' },
                { v:'per_pet', l:'Per husdjur' },
                { v:'fixed', l:'Fast pris' },
              ]} />
              <Field form={form} setForm={setForm} label="Ikon" field="icon" half select options={ICONS.map(i => ({ v:i, l:i.replace('ti-','') }))} />
              <Field form={form} setForm={setForm} label="Sorteringsordning" field="sort_order" type="number" half />
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({...f, visible: e.target.checked}))} />
                Synlig
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={form.bookable} onChange={e => setForm(f => ({...f, bookable: e.target.checked}))} />
                Bokningsbar
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={form.is_deposit} onChange={e => setForm(f => ({...f, is_deposit: e.target.checked}))} />
                Återbetalningsbar deposition
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer" }}>
                <input type="checkbox" checked={form.is_pet_fee} onChange={e => setForm(f => ({...f, is_pet_fee: e.target.checked}))} />
                Husdjursavgift (multipliceras med antal husdjur)
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
