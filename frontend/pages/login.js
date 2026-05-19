import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/api';

export default function Login() {
  const { t } = useTranslation('common');
  const { login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' });
  const [errorModal, setErrorModal] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.preventDefault();
    setLoading(true);
    console.log('Login attempt started');
    try {
      if (mode === 'login') {
        const user = await login(form.email, form.password);
        router.push(user.role === 'admin' || user.role === 'staff' ? '/admin' : '/');
      } else {
        await authApi.register(form);
        const user = await login(form.email, form.password);
        router.push('/');
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Ett fel uppstod. Kontrollera e-post och lösenord.';
      setErrorModal(msg);
      console.log('Error set:', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>{mode === 'login' ? t('auth.login_title') : t('auth.register_title')} — Sjölyckan</title></Head>

      {/* Felmeddelande-modal */}
      {errorModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'white', borderRadius: 12,
            padding: '32px 36px', maxWidth: 360, width: '100%',
            textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 12, color: '#a32d2d' }}>
              Inloggning misslyckades
            </h3>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', marginBottom: 24, lineHeight: 1.6 }}>
              {errorModal}
            </p>
            <button
              onClick={() => setErrorModal('')}
              style={{
                padding: '10px 36px',
                background: 'var(--water)', color: 'white',
                border: 'none', borderRadius: 8,
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
              }}>
              OK
            </button>
          </div>
        </div>
      )}

      <div style={{ minHeight: '100vh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'white', borderRadius: 24, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(26,36,32,0.12)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <a href="/" style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--water)' }}>Sjölyckan</a>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginTop: 8, fontWeight: 400 }}>
              {mode === 'login' ? t('auth.login_title') : t('auth.register_title')}
            </h1>
          </div>

          <form onSubmit={handle}>
            {mode === 'register' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder={t('auth.first_name')} value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  required style={inp} />
                <input placeholder={t('auth.last_name')} value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  required style={inp} />
              </div>
            )}

            <input placeholder={t('auth.email')} type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              autoComplete="email"
              required style={{ ...inp, marginBottom: 8 }} />

            {mode === 'register' && (
              <input placeholder={t('auth.phone')} value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                style={{ ...inp, marginBottom: 8 }} />
            )}

            <input placeholder={t('auth.password')} type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required style={{ ...inp, marginBottom: mode === 'register' ? 6 : 16 }} />

            {mode === 'register' && (
              <p style={{ fontSize: 11, color: 'var(--ink-pale)', marginBottom: 16 }}>{t('auth.password_hint')}</p>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 13,
              background: loading ? 'var(--ink-pale)' : 'var(--water)',
              color: 'white', border: 'none',
              borderRadius: 8, fontSize: 15, fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'background 0.2s',
            }}>
              {loading ? '...' : mode === 'login' ? t('auth.login_btn') : t('auth.register_btn')}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-pale)', marginTop: 16 }}>
            {mode === 'login' ? t('auth.no_account') : t('auth.has_account')}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrorModal(''); }}
              style={{ color: 'var(--water)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              {mode === 'login' ? t('auth.register_btn') : t('auth.login_btn')}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}

const inp = { width: '100%', padding: '10px 14px', border: '1px solid var(--sand-dark)', borderRadius: 8, fontSize: 14, outline: 'none', color: 'var(--ink)', background: 'white', boxSizing: 'border-box' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
