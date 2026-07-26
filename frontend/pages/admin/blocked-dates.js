import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

const emptyForm = () => ({
  date_from: '', date_to: '', reason: '', agent_id: '',
  guest_name: '', guest_email: '', guest_phone: '', guest_country: '',
  adults_count: '', children_count: '', pets_count: '',
});

export default function BlockedDatesPage() {
  const [blocks, setBlocks]   = useState([]);
  const [agents, setAgents]   = useState([]);
  const [form, setForm]       = useState(emptyForm());
  const [editing, setEditing] = useState(null); // id of block being edited
  const [msg, setMsg]         = useState('');

  const load = () => adminApi.getBlockedDates().then(r => setBlocks(r.data)).catch(() => {});
  useEffect(() => {
    load();
    adminApi.listAgents().then(r => setAgents(r.data.filter(a => a.is_active))).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.date_from || !form.date_to) { setMsg('Ange från- och till-datum'); return; }
    if (form.date_to <= form.date_from)   { setMsg('Till-datum måste vara efter från-datum'); return; }
    const payload = {
      ...form,
      agent_id: form.agent_id || null,
      adults_count: form.adults_count === '' ? null : Number(form.adults_count),
      children_count: form.children_count === '' ? null : Number(form.children_count),
      pets_count: form.pets_count === '' ? null : Number(form.pets_count),
    };
    try {
      if (editing) {
        await adminApi.updateBlockedDate(editing, payload);
        setMsg('Uppdaterat!');
      } else {
        await adminApi.createBlockedDate(payload);
        setMsg('Sparat!');
      }
      setForm(emptyForm());
      setEditing(null);
      load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const startEdit = (b) => {
    setEditing(b.id);
    setForm({
      date_from: b.date_from, date_to: b.date_to, reason: b.reason || '',
      agent_id: b.agent_id || '', guest_name: b.guest_name || '', guest_email: b.guest_email || '',
      guest_phone: b.guest_phone || '', guest_country: b.guest_country || '',
      adults_count: b.adults_count ?? '', children_count: b.children_count ?? '', pets_count: b.pets_count ?? '',
    });
    setMsg('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm());
    setMsg('');
  };

  const del = async (id) => {
    if (!confirm('Ta bort blockerat datum?')) return;
    try { await adminApi.deleteBlockedDate(id); load(); }
    catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 };
  const isAgentBooking = !!form.agent_id;

  return (
    <AdminLayout title="Blockerade datum">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:24, alignItems:'start' }}>

        {/* Lista */}
        <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--sand-dark)', fontSize:14, fontWeight:500 }}>
            Blockerade perioder
          </div>
          {blocks.length === 0 ? (
            <div style={{ padding:24, color:'var(--ink-pale)', fontSize:13 }}>Inga blockerade datum.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--sand)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.4px', color:'var(--ink-pale)' }}>
                  <th style={{ padding:'8px 14px', textAlign:'left' }}>Från</th>
                  <th style={{ padding:'8px 14px', textAlign:'left' }}>Till</th>
                  <th style={{ padding:'8px 14px', textAlign:'left' }}>Förmedlare / Anledning</th>
                  <th style={{ padding:'8px 14px' }} />
                </tr>
              </thead>
              <tbody>
                {blocks.map((b, i) => (
                  <tr key={b.id} style={{ borderTop:'1px solid var(--sand)', background: editing===b.id ? 'var(--water-pale)' : i%2===0 ? 'white' : 'var(--sand)' }}>
                    <td style={{ padding:'10px 14px', fontSize:13 }}>{b.date_from}</td>
                    <td style={{ padding:'10px 14px', fontSize:13 }}>{b.date_to}</td>
                    <td style={{ padding:'10px 14px', fontSize:13, color:'var(--ink-light)' }}>
                      {b.agent_name ? (
                        <>
                          <span style={{ fontWeight:500, color:'var(--ink)' }}>🤝 {b.agent_name}</span>
                          {b.guest_name && <> · {b.guest_name}</>}
                        </>
                      ) : (b.reason || '–')}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                      <button onClick={() => startEdit(b)}
                        style={{ padding:'4px 10px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12, marginRight:6 }}>
                        ✏️ Redigera
                      </button>
                      <button onClick={() => del(b.id)}
                        style={{ padding:'4px 10px', background:'white', color:'var(--red)', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12 }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Formulär */}
        <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', padding:20 }}>
          <div style={{ fontSize:14, fontWeight:500, marginBottom:16 }}>
            {editing ? '✏️ Redigera period' : '+ Lägg till period'}
          </div>
          {msg && <div style={{ padding:'8px 12px', background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', fontSize:13, marginBottom:12 }}>{msg}</div>}
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Från</label>
            <input type="date" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} style={inp} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Till</label>
            <input type="date" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} style={inp} />
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Förmedlare (valfri)</label>
            <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} style={inp}>
              <option value="">— Ingen (vanlig blockering) —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {!isAgentBooking && (
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Anledning (valfri)</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="t.ex. Underhåll, Privat vistelse" style={inp} />
            </div>
          )}

          {isAgentBooking && (
            <div style={{ border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', padding:12, marginBottom:16, background:'var(--sand)' }}>
              <div style={{ fontSize:12, fontWeight:500, color:'var(--ink-light)', marginBottom:10 }}>Gästuppgifter (förmedlar-bokning)</div>
              <div style={{ marginBottom:8 }}>
                <label style={lbl}>Namn</label>
                <input value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} style={inp} />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={lbl}>E-post</label>
                <input value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))} style={inp} />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={lbl}>Telefon</label>
                <input value={form.guest_phone} onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))} style={inp} />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={lbl}>Land</label>
                <input value={form.guest_country} onChange={e => setForm(f => ({ ...f, guest_country: e.target.value }))}
                  placeholder="t.ex. SE" style={inp} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Vuxna</label>
                  <input type="number" min="0" value={form.adults_count}
                    onChange={e => setForm(f => ({ ...f, adults_count: e.target.value }))} style={inp} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Barn</label>
                  <input type="number" min="0" value={form.children_count}
                    onChange={e => setForm(f => ({ ...f, children_count: e.target.value }))} style={inp} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Husdjur</label>
                  <input type="number" min="0" value={form.pets_count}
                    onChange={e => setForm(f => ({ ...f, pets_count: e.target.value }))} style={inp} />
                </div>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save}
              style={{ flex:1, padding:'9px 0', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontWeight:500, fontSize:13 }}>
              {editing ? 'Spara ändringar' : 'Lägg till'}
            </button>
            {editing && (
              <button onClick={cancelEdit}
                style={{ padding:'9px 14px', background:'var(--sand)', color:'var(--ink)', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                Avbryt
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
