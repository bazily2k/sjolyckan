import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email:'', password:'', first_name:'', last_name:'', role:'staff' });
  const [msg, setMsg] = useState('');

  const load = () => adminApi.listUsers().then(r => setUsers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

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

        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24, alignItems:'start' }}>
          {/* Lista */}
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--sand)', borderBottom:'1px solid var(--sand-dark)' }}>
                  {['Namn','E-post','Roll','Senast inloggad','Status'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:500, color:'var(--ink-light)', fontSize:11, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom:'1px solid var(--sand)' }}>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{u.first_name} {u.last_name}</td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-light)' }}>{u.email}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:500,
                        background: u.role === 'admin' ? '#faeeda' : u.role === 'staff' ? '#d1ecf1' : '#e2e3e5',
                        color: u.role === 'admin' ? '#854F0B' : u.role === 'staff' ? '#0c5460' : '#383d41',
                      }}>{u.role}</span>
                    </td>
                    <td style={{ padding:'10px 14px', color:'var(--ink-pale)', fontSize:12 }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('sv-SE') : '–'}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:11, color: u.is_active ? 'var(--forest)' : 'var(--red)' }}>
                        {u.is_active ? '● Aktiv' : '● Inaktiv'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Skapa personal */}
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', padding:20 }}>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:16 }}>Skapa personal/admin</h3>
            <form onSubmit={create}>
              {[
                { label:'Förnamn', field:'first_name' },
                { label:'Efternamn', field:'last_name' },
                { label:'E-post', field:'email', type:'email' },
                { label:'Lösenord', field:'password', type:'password' },
              ].map(({ label, field, type='text' }) => (
                <div key={field} style={{ marginBottom:10 }}>
                  <label style={lbl}>{label}</label>
                  <input type={type} required value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={inp} />
                </div>
              ))}
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>Roll</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                  <option value="staff">Personal (staff)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <p style={{ fontSize:11, color:'var(--ink-pale)', marginBottom:12 }}>
                Lösenord: minst 10 tecken, blandning av bokstäver, siffror och specialtecken.
              </p>
              <button type="submit" style={{ width:'100%', padding:10, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontWeight:500 }}>
                Skapa användare
              </button>
            </form>
          </div>
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
