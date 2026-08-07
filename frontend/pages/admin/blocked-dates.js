import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

const emptyForm = () => ({
  date_from: '', date_to: '', reason: '', internal_note: '', agent_id: '',
  guest_name: '', guest_email: '', guest_phone: '', guest_country: '',
  adults_count: '', children_count: '', pets_count: '', articles: [], files: [],
});

export default function BlockedDatesPage() {
  const [blocks, setBlocks]   = useState([]);
  const [agents, setAgents]   = useState([]);
  const [articleCatalog, setArticleCatalog] = useState([]);
  const [form, setForm]       = useState(emptyForm());
  const [editing, setEditing] = useState(null); // id of block being edited
  const [msg, setMsg]         = useState('');
  const [fileBusy, setFileBusy] = useState(false);

  const load = () => adminApi.getBlockedDates().then(r => setBlocks(r.data)).catch(() => {});
  useEffect(() => {
    load();
    adminApi.listAgents().then(r => setAgents(r.data.filter(a => a.is_active))).catch(() => {});
    adminApi.listArticles().then(r => setArticleCatalog((Array.isArray(r.data) ? r.data : []).filter(a => a.bookable && a.visible))).catch(() => {});
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
      internal_note: b.internal_note || '',
      agent_id: b.agent_id || '', guest_name: b.guest_name || '', guest_email: b.guest_email || '',
      guest_phone: b.guest_phone || '', guest_country: b.guest_country || '',
      adults_count: b.adults_count ?? '', children_count: b.children_count ?? '', pets_count: b.pets_count ?? '',
      articles: b.articles || [], files: b.files || [],
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

  const ALLOWED_FILE_EXT = ['pdf', 'doc', 'docx', 'eml', 'msg'];
  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // så samma fil kan väljas igen
    if (!file || !editing) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FILE_EXT.includes(ext)) {
      setMsg('Endast PDF, Word (.doc/.docx) och e-postfiler (.eml/.msg) tillåts');
      return;
    }
    setFileBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await adminApi.uploadBlockedDateFile(editing, fd);
      setForm(f => ({ ...f, files: [...f.files, r.data] }));
      load();
    } catch(e2) {
      setMsg('Fel vid uppladdning: ' + (e2.response?.data?.detail || e2.message));
    } finally {
      setFileBusy(false);
    }
  };

  const deleteFile = async (fileId) => {
    if (!editing || !confirm('Ta bort filen?')) return;
    try {
      await adminApi.deleteBlockedDateFile(editing, fileId);
      setForm(f => ({ ...f, files: f.files.filter(x => x.id !== fileId) }));
      load();
    } catch(e2) {
      setMsg('Fel: ' + (e2.response?.data?.detail || e2.message));
    }
  };

  const fileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const fileIcon = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📕';
    if (ext === 'doc' || ext === 'docx') return '📘';
    if (ext === 'eml' || ext === 'msg') return '✉️';
    return '📎';
  };

  const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 };
  const isAgentBooking = !!form.agent_id;

  const setArticleQty = (art, qty) => {
    setForm(f => {
      const rest = f.articles.filter(a => a.article_id !== art.id);
      if (qty <= 0) return { ...f, articles: rest };
      return {
        ...f,
        articles: [...rest, {
          article_id: art.id, name_sv: art.name_sv, name_en: art.name_en, name_de: art.name_de, quantity: qty,
        }],
      };
    });
  };
  const qtyOf = (articleId) => form.articles.find(a => a.article_id === articleId)?.quantity || 0;

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
                      {b.internal_note && <span title="Intern anteckning finns" style={{ marginLeft:6 }}>🔒</span>}
                      {b.files?.length > 0 && <span title={`${b.files.length} bifogad(e) fil(er)`} style={{ marginLeft:6 }}>📎 {b.files.length}</span>}
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

          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Kommentar (syns i admin-kalendern)</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Visas direkt på dagcellen i kalendern, t.ex. Stängt för målning"
              rows={2} style={{ ...inp, height:'auto', resize:'vertical', fontFamily:'inherit' }} />
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Intern anteckning (syns EJ i kalendern)</label>
            <textarea value={form.internal_note} onChange={e => setForm(f => ({ ...f, internal_note: e.target.value }))}
              placeholder="Bara synlig här och i detaljvyn – aldrig i kalenderrutan"
              rows={2} style={{ ...inp, height:'auto', resize:'vertical', fontFamily:'inherit' }} />
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Bifogade filer (PDF, Word, e-post)</label>
            {!editing ? (
              <div style={{ fontSize:12, color:'var(--ink-pale)', fontStyle:'italic' }}>
                Spara perioden först – därefter kan du bifoga filer.
              </div>
            ) : (
              <>
                {form.files.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    {form.files.map(f => (
                      <div key={f.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', marginBottom:6, fontSize:13 }}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--ink)', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                          {fileIcon(f.filename)} {f.filename}
                          {f.size_bytes ? <span style={{ color:'var(--ink-pale)' }}> ({fileSize(f.size_bytes)})</span> : null}
                        </a>
                        <button type="button" onClick={() => deleteFile(f.id)}
                          style={{ marginLeft:8, padding:'2px 8px', background:'white', color:'var(--red)', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12 }}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{
                  display:'inline-block', padding:'7px 12px', border:'1px dashed var(--sand-dark)',
                  borderRadius:'var(--radius-md)', cursor: fileBusy ? 'default' : 'pointer', fontSize:12,
                  color:'var(--ink-light)', opacity: fileBusy ? 0.6 : 1,
                }}>
                  {fileBusy ? 'Laddar upp…' : '+ Bifoga fil'}
                  <input type="file" accept=".pdf,.doc,.docx,.eml,.msg" onChange={uploadFile} disabled={fileBusy} style={{ display:'none' }} />
                </label>
                <div style={{ fontSize:11, color:'var(--ink-pale)', marginTop:4 }}>Max 20 MB per fil.</div>
              </>
            )}
          </div>

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

              {articleCatalog.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <label style={lbl}>Aktiva tillägg</label>
                  {articleCatalog.map(art => (
                    <div key={art.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--sand-dark)' }}>
                      <div style={{ fontSize:13 }}>{art.name_sv}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <button type="button" onClick={() => setArticleQty(art, qtyOf(art.id) - 1)}
                          style={{ width:24, height:24, border:'1px solid var(--sand-dark)', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:14, lineHeight:1 }}>–</button>
                        <span style={{ fontSize:13, minWidth:16, textAlign:'center' }}>{qtyOf(art.id)}</span>
                        <button type="button" onClick={() => setArticleQty(art, qtyOf(art.id) + 1)}
                          style={{ width:24, height:24, border:'1px solid var(--sand-dark)', borderRadius:'50%', background:'white', cursor:'pointer', fontSize:14, lineHeight:1 }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
