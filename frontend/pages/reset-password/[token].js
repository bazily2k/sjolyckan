import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
const API = process.env.NEXT_PUBLIC_API_URL || '/api';
export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password !== password2) { setMsg('Lösenorden stämmer inte överens.'); return; }
    if (password.length < 8) { setMsg('Lösenordet måste vara minst 8 tecken.'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, password });
      setDone(true);
      setMsg('Lösenordet har återställts! Du kan nu logga in.');
    } catch(err) {
      setMsg(err.response?.data?.detail || 'Länken är ogiltig eller har gått ut.');
    } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight:'100vh', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'white', borderRadius:'var(--radius-lg)', padding:32, width:'100%', maxWidth:420, boxShadow:'var(--shadow-md)' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:24, marginBottom:8 }}>Återställ lösenord</h1>
        {msg && (
          <div style={{ background: done ? 'var(--water-pale)' : '#fce8e8', border:`1px solid ${done ? 'var(--water)' : 'var(--red)'}`, borderRadius:'var(--radius-md)', padding:'12px 16px', fontSize:14, marginBottom:16 }}>{msg}</div>
        )}
        {!done && (
          <form onSubmit={submit}>
            <input type="password" placeholder="Nytt lösenord (min 8 tecken)" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:10, boxSizing:'border-box', outline:'none' }} />
            <input type="password" placeholder="Bekräfta lösenord" value={password2} onChange={e => setPassword2(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:16, boxSizing:'border-box', outline:'none' }} />
            <button type="submit" disabled={loading} style={{ width:'100%', padding:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', fontSize:15, fontWeight:500, cursor:'pointer' }}>
              {loading ? '...' : 'Spara nytt lösenord'}
            </button>
          </form>
        )}
        <p style={{ textAlign:'center', marginTop:16, fontSize:13 }}>
          <a href="/login" style={{ color:'var(--water)' }}>← Tillbaka till inloggning</a>
        </p>
      </div>
    </div>
  );
}
export async function getServerSideProps({ locale }) {
  const { serverSideTranslations } = require('next-i18next/serverSideTranslations');
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
