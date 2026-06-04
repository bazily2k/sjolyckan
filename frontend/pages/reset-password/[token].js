import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import axios from 'axios';
const API = process.env.NEXT_PUBLIC_API_URL || '/api';
export default function ResetPassword() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { token } = router.query;
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password !== password2) { setMsg(t('auth.reset_mismatch')); return; }
    if (password.length < 8) { setMsg(t('auth.reset_short')); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, password, lang: router.locale });
      setDone(true);
      setMsg(t('auth.reset_success'));
    } catch(err) {
      setMsg(err.response?.data?.detail || t('auth.reset_invalid'));
    } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight:'100vh', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'white', borderRadius:'var(--radius-lg)', padding:32, width:'100%', maxWidth:420, boxShadow:'var(--shadow-md)' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:24, marginBottom:8 }}>{t('auth.reset_title')}</h1>
        {msg && (
          <div style={{ background: done ? 'var(--water-pale)' : '#fce8e8', border:`1px solid ${done ? 'var(--water)' : 'var(--red)'}`, borderRadius:'var(--radius-md)', padding:'12px 16px', fontSize:14, marginBottom:16 }}>{msg}</div>
        )}
        {!done && (
          <form onSubmit={submit}>
            <input type="password" placeholder={t('auth.new_password')} value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:10, boxSizing:'border-box', outline:'none' }} />
            <input type="password" placeholder={t('auth.confirm_password')} value={password2} onChange={e => setPassword2(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:16, boxSizing:'border-box', outline:'none' }} />
            <button type="submit" disabled={loading} style={{ width:'100%', padding:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', fontSize:15, fontWeight:500, cursor:'pointer' }}>
              {loading ? '...' : t('auth.reset_btn')}
            </button>
          </form>
        )}
        <p style={{ textAlign:'center', marginTop:16, fontSize:13 }}>
          <a href={router.locale && router.locale !== 'sv' ? `/${router.locale}/login` : '/login'} style={{ color:'var(--water)' }}>{t('auth.back_to_login')}</a>
        </p>
      </div>
    </div>
  );
}
export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
