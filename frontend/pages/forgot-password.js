import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import axios from 'axios';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_URL || '/api';
export default function ForgotPassword() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email, lang: router.locale || 'sv' });
      setMsg(t('auth.forgot_sent'));
    } catch(err) {
      setMsg(t('auth.forgot_error'));
    } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight:'100vh', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'white', borderRadius:'var(--radius-lg)', padding:32, width:'100%', maxWidth:420, boxShadow:'var(--shadow-md)' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:24, marginBottom:8 }}>{t('auth.forgot_title')}</h1>
        <p style={{ fontSize:14, color:'var(--ink-light)', marginBottom:24 }}>{t('auth.forgot_desc')}</p>
        {msg ? (
          <div style={{ background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'12px 16px', fontSize:14, color:'var(--ink)', marginBottom:16 }}>{msg}</div>
        ) : (
          <form onSubmit={submit}>
            <input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none' }} />
            <button type="submit" disabled={loading} style={{ width:'100%', padding:12, background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', fontSize:15, fontWeight:500, cursor:'pointer' }}>
              {loading ? '...' : t('auth.forgot_btn')}
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
