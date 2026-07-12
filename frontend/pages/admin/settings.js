import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import CollapsibleSection from '../../components/admin/CollapsibleSection';
import { adminApi } from '../../lib/api';

const SETTING_GROUPS = [
  { title: '🏡 Fastighet', keys: ['property_name','property_address','checkin_time','checkout_time','max_guests','swish_number'] },
  { title: '📧 E-post', keys: ['email_provider'] },
  { title: '📄 Dokument', keys: ['attach_terms_pdf','attach_gdpr_pdf'] },
  { title: '📋 Bokningsinställningar', keys: ['booking_ref_style'] },
  { title: '🔑 Incheckningsinfo (mejl dagen före ankomst)', keys: ['checkin_door_code','checkin_wifi','checkin_directions'] },
];
const SETTINGS = [
  { key: 'property_name',    label: 'Stugans namn',     type: 'text' },
  { key: 'property_address', label: 'Adress',            type: 'text' },
  { key: 'checkin_time',     label: 'Incheckningstid',   type: 'text' },
  { key: 'checkout_time',    label: 'Utcheckningstid',   type: 'text' },
  { key: 'max_guests',       label: 'Max antal gäster',  type: 'text' },
  { key: 'swish_number',     label: 'Swish-nummer',      type: 'text' },
  { key: 'checkin_door_code',  label: 'Dörrkod / lås',        type: 'text' },
  { key: 'checkin_wifi',       label: 'Wifi (nätverk & lösenord)', type: 'text' },
  { key: 'checkin_directions', label: 'Vägbeskrivning / hitta hit', type: 'textarea' },
  { key: 'email_provider',   label: 'E-postleverantör',  type: 'select',
    options: [
      { value: 'mailersend', label: 'Mailersend (primär)' },
      { value: 'brevo',      label: 'Brevo SMTP (backup)' },
    ]
  },
  { key: 'attach_terms_pdf', label: 'Bifoga bokningsvillkor som PDF i bekräftelsemail', type: 'select',
    options: [
      { value: 'false', label: 'Nej' },
      { value: 'true',  label: 'Ja' },
    ]
  },
  { key: 'attach_gdpr_pdf', label: 'Bifoga GDPR-dokument som PDF i bekräftelsemail', type: 'select',
    options: [
      { value: 'false', label: 'Nej' },
      { value: 'true',  label: 'Ja' },
    ]
  },
  { key: 'booking_ref_style', label: 'Bokningsreferens-stil', type: 'select',
    options: [
      { value: 'sequential', label: 'Löpnummer (0001, 0002...)' },
      { value: 'random',     label: 'Slumpmässigt (4 siffror)' },
    ]
  },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [editing, setEditing]   = useState({});
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    adminApi.getSettings().then(r => {
      setSettings(r.data);
      setEditing(r.data);
    }).catch(() => {});
  }, []);

  const save = async (key) => {
    try {
      await adminApi.updateSetting(key, editing[key]);
      setSettings(s => ({ ...s, [key]: editing[key] }));
      setMsg(`"${SETTINGS.find(s => s.key === key)?.label || key}" sparat!`);
    } catch (e) {
      setMsg('Fel: ' + e.message);
    }
  };

  return (
    <>
      <Head><title>Inställningar — Admin Sjölyckan</title></Head>
      <AdminLayout title="Inställningar">
        {msg && (
          <div style={msgBox}>
            {msg}
            <button onClick={() => setMsg('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
          </div>
        )}
        <div style={{ maxWidth: 600 }}>
          {SETTING_GROUPS.map(group => {
            const groupSettings = SETTINGS.filter(s => group.keys.includes(s.key));
            return (
              <CollapsibleSection key={group.title} title={group.title} noPad defaultOpen={false} storageKey={`settings-${group.title}`}>
                {groupSettings.map((s, i) => (
                  <div key={s.key} style={{ padding: '14px 16px', borderBottom: i < groupSettings.length - 1 ? '1px solid var(--sand)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>{s.label}</div>
                      {s.type === 'select' ? (
                        <select value={editing[s.key] || s.options[0].value}
                          onChange={e => setEditing(prev => ({ ...prev, [s.key]: e.target.value }))}
                          style={{ padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 14, background: 'white', width: '100%' }}>
                          {s.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : s.type === 'textarea' ? (
                        <textarea value={editing[s.key] || ''} rows={3}
                          onChange={e => setEditing(prev => ({ ...prev, [s.key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
                      ) : (
                        <input value={editing[s.key] || ''}
                          onChange={e => setEditing(prev => ({ ...prev, [s.key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' }} />
                      )}
                    </div>
                    <button onClick={() => save(s.key)}
                      style={{ padding: '8px 16px', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      Spara
                    </button>
                  </div>
                ))}
                {group.title.includes('Incheckningsinfo') && <CheckinInfoManager />}
              </CollapsibleSection>
            );
          })}
        </div>
      </AdminLayout>
    </>
  );
}

const msgBox = {
  background: 'var(--water-pale)', border: '1px solid var(--water)',
  borderRadius: 'var(--radius-md)', padding: '10px 16px',
  marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between',
};

function CheckinInfoManager() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title_sv:'', body_sv:'', title_en:'', body_en:'', title_de:'', body_de:'', icon:'', item_type:'static', active:true, sort_order:0 });
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => { try { const r = await adminApi.listCheckinInfo(); setItems(r.data || []); } catch (e) {} };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ title_sv:'', body_sv:'', title_en:'', body_en:'', title_de:'', body_de:'', icon:'', item_type:'static', active:true, sort_order:0 }); setEditingId(null); setOpen(false); };
  const edit = (it) => { setForm({ ...it }); setEditingId(it.id); setOpen(true); };
  const save = async () => {
    if (!form.title_sv.trim()) return;
    try {
      if (editingId) await adminApi.updateCheckinInfo(editingId, form);
      else await adminApi.createCheckinInfo(form);
      reset(); await load();
    } catch (e) {}
  };
  const toggle = async (id) => { await adminApi.toggleCheckinInfo(id); await load(); };
  const remove = async (id) => { if (!confirm('Ta bort denna infopunkt?')) return; await adminApi.deleteCheckinInfo(id); await load(); };

  const inp = (key, ph, area) => area
    ? <textarea value={form[key]} placeholder={ph} rows={2} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, fontFamily:'inherit', resize:'vertical', marginBottom:8 }} />
    : <input value={form[key]} placeholder={ph} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:8 }} />;

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--sand)' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 8 }}>Egna infopunkter (visas i incheckningsmailet, endast aktiva)</div>

      {items.map(it => (
        <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', marginBottom:6, background: it.active ? 'white' : 'var(--sand)', opacity: it.active ? 1 : 0.55 }}>
          <span style={{ flex:1, fontSize:13 }}>{it.icon} <strong>{it.title_sv}</strong>{it.item_type === 'code' && <span style={{ fontSize:10, color:'var(--water)', marginLeft:6 }}>KOD</span>}</span>
          <span style={{ fontSize:11, color: it.active ? '#2e7d32' : 'var(--ink-pale)' }}>{it.active ? 'Aktiv' : 'Av'}</span>
          <button onClick={() => edit(it)} style={miniBtn}>Ändra</button>
          <button onClick={() => toggle(it.id)} style={miniBtn}>{it.active ? 'Inaktivera' : 'Aktivera'}</button>
          <button onClick={() => remove(it.id)} style={{ ...miniBtn, color:'#c0392b' }}>Ta bort</button>
        </div>
      ))}
      {items.length === 0 && <div style={{ fontSize:12, color:'var(--ink-pale)', marginBottom:8 }}>Inga punkter ännu.</div>}

      {open ? (
        <div style={{ border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', padding:12, marginTop:8, background:'white' }}>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ width:80 }}>{inp('icon','Ikon')}</div>
            <div style={{ flex:1 }}>{inp('title_sv','Rubrik (SV) *')}</div>
          </div>
          <div style={{ marginBottom:8 }}>
            <label style={{ fontSize:12, color:'var(--ink-pale)', display:'block', marginBottom:4 }}>Typ</label>
            <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}
              style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, background:'white' }}>
              <option value="static">Statisk text (samma för alla)</option>
              <option value="code">Kod (unikt värde per bokning)</option>
            </select>
            {form.item_type === 'code' &&
              <div style={{ fontSize:11, color:'var(--ink-light)', marginTop:4 }}>
                Ett kodfält visas på varje bokning. Punkten kommer bara med i mailet om du fyllt i ett värde där.
              </div>}
          </div>
          {inp('body_sv','Text (SV)', true)}
          <details style={{ marginBottom:8 }}>
            <summary style={{ fontSize:12, color:'var(--ink-light)', cursor:'pointer' }}>Engelska & tyska (valfritt)</summary>
            <div style={{ marginTop:8 }}>
              {inp('title_en','Rubrik (EN)')}{inp('body_en','Text (EN)', true)}
              {inp('title_de','Rubrik (DE)')}{inp('body_de','Text (DE)', true)}
            </div>
          </details>
          <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Aktiv (kommer med i mailet)
          </label>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save} style={{ ...miniBtn, background:'var(--water)', color:'white', border:'none', padding:'7px 16px' }}>{editingId ? 'Spara' : 'Lägg till'}</button>
            <button onClick={reset} style={miniBtn}>Avbryt</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{ ...miniBtn, marginTop:4 }}>+ Lägg till infopunkt</button>
      )}
    </div>
  );
}

const miniBtn = { padding:'5px 10px', background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12, whiteSpace:'nowrap' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
