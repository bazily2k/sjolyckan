import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi, authApi } from '../../lib/api';
import PasswordField, { isStrongPassword } from '../../components/common/PasswordField';
import CollapsibleSection from '../../components/admin/CollapsibleSection';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email:'', password:'', first_name:'', last_name:'', role:'staff' });
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [setupMsg, setSetupMsg] = useState('');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [editMsg, setEditMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [myRole, setMyRole] = useState(null);
  const isAdmin = myRole === 'admin';

  const load = () => adminApi.listUsers()
    .then(r => setUsers(Array.isArray(r.data) ? r.data : (r.data.items || [])))
    .catch(() => {});

  useEffect(() => {
    load();
    authApi.me().then(r => setMyRole(r.data.role)).catch(() => {});
  }, []);

  const startEdit = (u) => {
    setEditingUser(u.id);
    setEditForm({ email: u.email, first_name: u.first_name||'', last_name: u.last_name||'', phone: u.phone||'', country: u.country||'SE', address_line1: u.address_line1||'', postal_code: u.postal_code||'', city: u.city||'' });
    setNewPassword(''); setPwMsg('');
  };
  const saveEdit = async () => {
    try {
      await adminApi.updateUserFull(editingUser, editForm);
      setMsg('Användare uppdaterad!');
      setEditingUser(null);
      load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };
  const deleteUser = async (userId) => {
    try {
      await adminApi.deleteUser(userId);
      setEditingUser(null); setEditMsg(''); setConfirmDeleteUser(false); setMsg('Användare borttagen.');
      load();
    } catch(e) {
      setConfirmDeleteUser(false);
      const d = e.response?.data?.detail;
      const msg = typeof d === 'string' ? d
        : Array.isArray(d) ? d.map(x => x.msg || JSON.stringify(x)).join(', ')
        : d ? JSON.stringify(d) : e.message;
      setEditMsg('Fel: ' + msg);
    }
  };

  const resetPassword = async (userId) => {
    if (!isStrongPassword(newPassword)) { setPwMsg('Uppfyller inte lösenordskraven'); return; }
    try {
      await adminApi.adminResetPassword(userId, { password: newPassword });
      setPwMsg('Lösenord återställt!');
      setNewPassword('');
    } catch(e) { setPwMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const updateRole = async (userId, role) => {
    try {
      await adminApi.updateUserRole(userId, { role });
      setMsg('Roll uppdaterad!');
      load();
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const updateDiscount = async (userId, discountPct) => {
    try {
      await adminApi.updateUserDiscount(userId, { discount_pct: parseFloat(discountPct) });
      setMsg('Rabatt uppdaterad!');
      load();
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await adminApi.createStaff(form);
      setMsg('Användare skapad!');
      setForm({ email:'', password:'', first_name:'', last_name:'', role:'staff' });
      load();
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <>
      <Head><title>Användare — Admin Sjölyckan</title></Head>
      <AdminLayout title="Användare">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={{ border:'none', background:'none', cursor:'pointer' }}>×</button></div>}
        <div style={{ display:'grid', gridTemplateColumns:isAdmin && !isMobile?'1fr 340px':'1fr', gap:24, alignItems:'start' }}>
          {/* Lista */}
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', overflow:'hidden', overflowX:'auto', order: isMobile ? 2 : 1 }}>
            {isMobile ? (
              /* Kortlista på mobil */
              <div>
                {users.map(u => (
                  <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--sand)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{u.first_name} {u.last_name}</div>
                      <div style={{ fontSize:12, color:'var(--ink-light)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                      <div style={{ fontSize:11, color:'var(--ink-pale)', marginTop:2 }}>
                        {u.role === 'admin' ? 'Admin' : u.role === 'staff' ? 'Personal' : u.role === 'friend' ? 'Vän' : 'Gäst'}
                        {u.discount_pct > 0 ? ` · ${u.discount_pct}% rabatt` : ''}
                        {!u.is_active ? ' · Inaktiv' : ''}
                      </div>
                    </div>
                    <button onClick={() => startEdit(u)} disabled={u.role === 'admin' && !isAdmin}
                      style={{ padding:'6px 12px', fontSize:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:(u.role==='admin'&&!isAdmin)?'not-allowed':'pointer', opacity:(u.role==='admin'&&!isAdmin)?0.5:1, flexShrink:0 }}>
                      Redigera
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* Tabell på desktop/surfplatta */
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--sand)', borderBottom:'1px solid var(--sand-dark)' }}>
                  {['Namn','E-post','Roll','Rabatt %','Senast inloggad','Status',''].map((h,i) => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:500, color:'var(--ink-light)', fontSize:11, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom:'1px solid var(--sand)' }}>
                    <td style={{ padding:'10px 14px', fontWeight:500, whiteSpace:'nowrap' }}>{u.first_name} {u.last_name}</td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-light)', maxWidth: isMobile ? 150 : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</td>
                    <td style={{ padding:'10px 14px', display: isMobile ? 'none' : '' }}>
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                        disabled={u.role === 'admin' && !isAdmin}
                        style={{ padding:'3px 8px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:12,
                          background: u.role === 'admin' ? '#faeeda' : u.role === 'staff' ? '#d1ecf1' : u.role === 'friend' ? '#d4edda' : '#e2e3e5',
                          color: u.role === 'admin' ? '#854F0B' : u.role === 'staff' ? '#0c5460' : u.role === 'friend' ? '#155724' : '#383d41',
                        }}>
                        <option value="guest">Gäst</option>
                        <option value="friend">Vän/Bekant</option>
                        <option value="staff">Personal</option>
                        {(isAdmin || u.role === 'admin') && <option value="admin">Admin</option>}
                      </select>
                    </td>
                    <td style={{ padding:'10px 14px', display: isMobile ? 'none' : '' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <input type='number' min='0' max='100'
                          defaultValue={u.discount_pct || 0}
                          onBlur={e => updateDiscount(u.id, e.target.value)}
                          disabled={u.role === 'admin' && !isAdmin}
                          style={{ width:50, padding:'4px 6px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:12, textAlign:'center' }}
                        />
                        <span style={{ fontSize:11, color:'var(--ink-pale)' }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-pale)', fontSize:12, display: isMobile ? 'none' : '' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('sv-SE') : '–'}
                    </td>
                    <td style={{ padding:'10px 14px', display: isMobile ? 'none' : '' }}>
                      <span style={{ fontSize:11, color: u.is_active ? 'var(--forest)' : 'var(--red)' }}>
                        {u.is_active ? '● Aktiv' : '● Inaktiv'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <button onClick={() => startEdit(u)} disabled={u.role === 'admin' && !isAdmin} style={{ padding:'4px 10px', fontSize:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:(u.role === 'admin' && !isAdmin)?'not-allowed':'pointer', opacity:(u.role === 'admin' && !isAdmin)?0.5:1 }}>Redigera</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            )}
          </div>

          {/* Redigera användare */}
          {editingUser && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ background:'white', borderRadius:'var(--radius-lg)', padding:24, width:isMobile?'calc(100vw - 32px)':480, maxWidth:'calc(100vw - 32px)', maxHeight:'90vh', overflowY:'auto', boxSizing:'border-box' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, margin:0 }}>Redigera användare</h3>
                  <button onClick={() => { setEditingUser(null); setEditMsg(''); setConfirmDeleteUser(false); }} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink-pale)', lineHeight:1 }}>×</button>
                </div>
                {[
                  {l:'Förnamn', f:'first_name'}, {l:'Efternamn', f:'last_name'},
                  {l:'E-post', f:'email', t:'email'}, {l:'Telefon', f:'phone'},
                  {l:'Gatuadress', f:'address_line1'}, {l:'C/o, lägenhetsnr', f:'address_line2'}, {l:'Postnummer', f:'postal_code'},
                  {l:'Ort', f:'city'},
                ].map(({l,f,t}) => (
                  <div key={f} style={{ marginBottom:10 }}>
                    <label style={{ fontSize:11, color:'var(--ink-pale)', display:'block', marginBottom:2 }}>{l}</label>
                    <input type={t||'text'} value={editForm[f]||''} onChange={e => setEditForm(ef => ({...ef,[f]:e.target.value}))}
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
                <div style={{ display:'flex', gap:8, marginTop:16 }}>
                  <button onClick={saveEdit} style={{ flex:1, padding:10, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>Spara ändringar</button>
                  <button onClick={() => { setEditingUser(null); setEditMsg(''); }} style={{ flex:1, padding:10, background:'var(--sand)', color:'var(--ink)', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>Avbryt</button>
                </div>
                {editMsg && <div style={{ fontSize:12, color:'var(--red)', marginTop:8, padding:'8px 10px', background:'#fdf3f3', borderRadius:'var(--radius-md)', border:'1px solid #f5c6cb' }}>{editMsg}</div>}
                <div style={{ borderTop:'1px solid var(--sand-dark)', marginTop:16, paddingTop:16 }}>
                  <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Återställ lösenord</div>
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <PasswordField value={newPassword} onChange={setNewPassword} placeholder='Nytt lösenord' lang="sv" showRequirements showGenerate
                        style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13 }} />
                    </div>
                    <button onClick={() => resetPassword(editingUser)} style={{ padding:'8px 14px', background:'var(--ink)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>Spara</button>
                  </div>
                  {pwMsg && <div style={{ fontSize:12, color:'var(--forest)', marginTop:6 }}>{pwMsg}</div>}
                </div>
                <div style={{ borderTop:'1px solid var(--sand-dark)', marginTop:16, paddingTop:16 }}>
                  <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Inloggningsinbjudan</div>
                  <div style={{ fontSize:12, color:'var(--ink-pale)', marginBottom:10 }}>Skicka ett nytt e-postmeddelande med länk för att sätta lösenord (7 dagar giltig).</div>
                  <button onClick={async () => { try { const res = await adminApi.resendSetupEmail(editingUser); setSetupMsg('Mejl skickat till ' + res.data.email); } catch(e) { setSetupMsg('Fel: ' + (e.response?.data?.detail || e.message)); } }}
                    style={{ width:'100%', padding:'8px 0', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                    ✉️ Skicka om inloggningsinbjudan
                  </button>
                  {setupMsg && <div style={{ fontSize:12, color:'var(--forest)', marginTop:6 }}>{setupMsg}</div>}
                </div>
                {editingUser && users.find(u => u.id === editingUser)?.role !== 'admin' && (
                  <div style={{ borderTop:'1px solid var(--sand-dark)', marginTop:16, paddingTop:16 }}>
                    <div>
                    {!confirmDeleteUser ? (
                      <button onClick={() => setConfirmDeleteUser(true)}
                        style={{ width:'100%', padding:'8px 0', background:'white', color:'var(--red)', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                        🗑 Ta bort användare
                      </button>
                    ) : (
                      <div style={{ background:'#fdf3f3', border:'1px solid #f5c6cb', borderRadius:'var(--radius-md)', padding:12 }}>
                        <div style={{ fontSize:13, marginBottom:10 }}>⚠️ Är du säker? Åtgärden kan inte ångras.</div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={() => deleteUser(editingUser)}
                            style={{ flex:1, padding:'8px 0', background:'var(--red)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, fontWeight:500 }}>
                            Ja, ta bort
                          </button>
                          <button onClick={() => setConfirmDeleteUser(false)}
                            style={{ flex:1, padding:'8px 0', background:'var(--sand)', color:'var(--ink)', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                            Avbryt
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {isAdmin && (
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', padding:20, order: isMobile ? 1 : 2 }}>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:16 }}>Skapa användare</h3>
            <form onSubmit={create}>
              {[
                { label:'Förnamn', field:'first_name' },
                { label:'Efternamn', field:'last_name' },
                { label:'E-post', field:'email', type:'email' },
                { label:'Lösenord', field:'password', type:'password' },
              ].map(({ label, field, type='text' }) => (
                <div key={field} style={{ marginBottom:10 }}>
                  <label style={lbl}>{label}</label>
                  {type === 'password' ? (
                    <PasswordField value={form[field]} onChange={v => setForm(f => ({ ...f, [field]: v }))} style={inp} lang="sv" showRequirements showGenerate />
                  ) : (
                    <input type={type} required value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      style={inp} />
                  )}
                </div>
              ))}
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>Roll</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                  <option value="guest">Gäst</option>
                  <option value="friend">Vän/Bekant</option>
                  <option value="staff">Personal (staff)</option>
                  {isAdmin && <option value="admin">Admin</option>}
                </select>
              </div>
              <button type="submit" style={{ width:'100%', padding:10, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontWeight:500 }}>
                Skapa användare
              </button>
            </form>
          </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const lbl = { fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', display:'block', marginBottom:3 };
const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' };
const msgBox = { background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'10px 16px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
