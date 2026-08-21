import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth, isAdmin } from '../../lib/auth';
import { adminApi } from '../../lib/api';

export default function AdminLayout({ children, title = 'Admin' }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin(user))) router.push('/login');
  }, [user, loading]);

  const [emailAlert, setEmailAlert] = useState(false);
  useEffect(() => {
    if (!user) return;
    adminApi.getEmailHealth().then(r => setEmailAlert(r.data.failed_7d > 0)).catch(() => {});
  }, [user]);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setNavOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontFamily:'var(--font-body)', color:'var(--ink-light)' }}>Laddar admin-panelen...</div>;
  if (!user) return null;

  const navItems = [
    { href: '/admin',               label: '📋 Bokningar' },
    { href: '/admin/calendar',      label: '🗓️ Kalender' },
    { href: '/admin/seasons',       label: '📅 Säsonger & priser' },
    { href: '/admin/articles',      label: '🎯 Tillägg' },
    { href: '/admin/content',       label: '✏️ Innehåll & bilder' },
    { href: '/admin/settings',      label: '⚙️ Inställningar' },
    { href: '/admin/users',         label: '👥 Användare' },
    { href: '/admin/agents',        label: '🤝 Förmedlare' },
    { href: '/admin/email-logs',    label: '📧 E-postlogg', alert: true },
    { href: '/admin/email-templates', label: '✉️ Mailmallar' },
    { href: '/admin/checkin-info',  label: '🔑 Incheckningsinfo' },
    { href: '/admin/blocked-dates', label: '🚫 Blockerade datum' },
    { href: '/admin/client-errors', label: '⚠️ Felrapporter' },
  ];

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--sand)' }}>

      {/* Overlay (mobil) */}
      {navOpen && (
        <div className="admin-overlay" onClick={() => setNavOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000 }} />
      )}

      {/* Nav-sidebar */}
      <aside className={`admin-sidebar${navOpen ? ' is-open' : ''}`} style={{
        width:220, background:'var(--ink)', color:'white',
        display:'flex', flexDirection:'column',
        position:'fixed', top:0, left:0, bottom:0,
        transition:'transform 0.22s ease',
        zIndex:1001,
      }}>
        <div style={{ padding:'24px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <a href="/" style={{ fontFamily:'var(--font-display)', fontSize:18, color:'white' }}>Sjölyckan</a>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.5px' }}>Admin</div>
          </div>
          <button className="admin-close-btn" onClick={() => setNavOpen(false)}
            style={{ background:'none', border:'none', color:'rgba(255,255,255,0.6)', fontSize:24, cursor:'pointer', lineHeight:1, padding:0, marginTop:2 }}>
            ×
          </button>
        </div>

        <nav style={{ flex:1, padding:'16px 0' }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} onClick={() => setNavOpen(false)} style={{
              display:'block', padding:'10px 20px', fontSize:13,
              color: router.pathname === item.href ? 'white' : 'rgba(255,255,255,0.6)',
              background: router.pathname === item.href ? 'rgba(255,255,255,0.1)' : 'transparent',
              borderLeft: router.pathname === item.href ? '3px solid var(--water-light)' : '3px solid transparent',
            }}>
              {item.label}
              {item.alert && emailAlert && (
                <span style={{ marginLeft:6, background:'#e74c3c', borderRadius:8, padding:'1px 6px', fontSize:10, color:'white', fontWeight:700 }}>!</span>
              )}
            </a>
          ))}
        </nav>

        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.1)', marginBottom:8 }}>
          <a href="/" target="_blank" style={{ fontSize:12, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:4 }}>
            🌐 Visa bokningssidan →
          </a>
        </div>
        <div style={{ padding:'8px 20px 16px' }}>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:8 }}>{user.email}</div>
          <button onClick={logout} style={{
            width:'100%', padding:'7px 0', background:'rgba(255,255,255,0.08)',
            color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.15)',
            borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12,
          }}>
            Logga ut
          </button>
        </div>
      </aside>

      {/* Huvudinnehåll */}
      <main className="admin-main" style={{
        marginLeft: 220,
        flex:1,
        padding: '32px 36px',
        maxWidth:1200,
        boxSizing:'border-box',
      }}>
        {/* Mobilhuvud med hamburger (visas via CSS på mobil) */}
        <div className="admin-mobile-header" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <button onClick={() => setNavOpen(true)} style={{
            background:'var(--ink)', color:'white', border:'none',
            borderRadius:'var(--radius-md)', width:38, height:38,
            fontSize:20, cursor:'pointer', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>☰</button>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:20, color:'var(--ink)', margin:0 }}>{title}</h1>
        </div>
        {/* Desktop-rubrik (visas via CSS på desktop) */}
        <h1 className="admin-desktop-title" style={{ fontFamily:'var(--font-display)', fontSize:26, marginBottom:24, color:'var(--ink)' }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
