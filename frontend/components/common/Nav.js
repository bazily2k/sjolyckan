import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useAuth, isAdmin } from '../../lib/auth';
import { useState, useEffect } from 'react';

export default function Nav() {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const changeLocale = (locale) => {
    router.push(router.pathname, router.asPath, { locale });
  };

  const textColor = scrolled ? 'var(--ink)' : 'white';
  const textMuted = scrolled ? 'var(--ink-light)' : 'rgba(255,255,255,0.8)';

  return (
    <nav style={{
      position:'fixed', top:0, left:0, right:0, zIndex:100,
      background: scrolled ? 'rgba(250,250,248,0.96)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(45,106,143,0.1)' : 'none',
      transition:'all 0.3s ease', padding:'0 24px',
    }}>
      <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:64 }}>
        <a href="/" style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:500, color:textColor, letterSpacing:'-0.5px' }}>
          Sjölyckan
        </a>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {['sv','en','de'].map(loc => (
            <button key={loc} onClick={() => changeLocale(loc)} style={{
              padding:'4px 8px', border:'none',
              background: router.locale === loc ? (scrolled ? 'var(--water-pale)' : 'rgba(255,255,255,0.2)') : 'transparent',
              borderRadius:'var(--radius-sm)', cursor:'pointer',
              fontSize:12, fontWeight:500,
              color: scrolled ? 'var(--ink-light)' : 'rgba(255,255,255,0.85)',
              textTransform:'uppercase', letterSpacing:'1px', fontWeight:600,
            }}>
              {loc==='sv'?'SV':loc==='en'?'EN':'DE'}
            </button>
          ))}
          <div style={{ width:1, height:20, background: scrolled ? 'var(--sand-dark)' : 'rgba(255,255,255,0.3)', margin:'0 8px' }} />
          {mounted && user ? (
            <>
              {isAdmin(user) && (
                <a href="/admin" style={{ padding:'6px 14px', fontSize:13, fontWeight:500, color: scrolled ? 'var(--water)' : 'white', border:`1px solid ${scrolled ? 'var(--water)' : 'rgba(255,255,255,0.5)'}`, borderRadius:'var(--radius-md)' }}>
                  {t('nav.admin')}
                </a>
              )}
              <a href="/my" style={{ padding:'8px 16px', background: scrolled ? 'var(--water)' : 'rgba(255,255,255,0.15)', color:'white', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, border: scrolled ? 'none' : '1px solid rgba(255,255,255,0.4)' }}>
                {t('nav.my_bookings')}
              </a>
              <button onClick={logout} style={{ padding:'6px 12px', fontSize:13, background:'transparent', border:'none', cursor:'pointer', color:textMuted }}>
                {t('nav.logout')}
              </button>
            </>
          ) : mounted ? (
            <a href="/login" style={{ padding:'8px 20px', background: scrolled ? 'var(--water)' : 'rgba(255,255,255,0.15)', color:'white', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, border: scrolled ? 'none' : '1px solid rgba(255,255,255,0.4)' }}>
              {t('nav.login')}
            </a>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
