import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth, isAdmin } from '../../lib/auth';

export default function AdminLayout({ children, title = 'Admin' }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin(user))) {
      router.push('/login');
    }
  }, [user, loading]);

  if (loading || !user) return null;

  const navItems = [
    { href: '/admin', label: '📋 Bokningar' },
    { href: '/admin/seasons', label: '📅 Säsonger & priser' },
    { href: '/admin/articles', label: '🎯 Tillägg' },
    { href: '/admin/content', label: '✏️ Innehåll & bilder' },
    { href: '/admin/settings', label: '⚙️ Inställningar' },
    { href: '/admin/users', label: '👥 Användare' },
    { href: '/admin/email-logs', label: '📧 E-postlogg' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sand)' }}>
      <aside style={{
        width: 220, background: 'var(--ink)', color: 'white',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0,
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <a href="/" style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'white' }}>Sjölyckan</a>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin</div>
        </div>
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} style={{
              display: 'block', padding: '10px 20px',
              fontSize: 13, color: router.pathname === item.href ? 'white' : 'rgba(255,255,255,0.6)',
              background: router.pathname === item.href ? 'rgba(255,255,255,0.1)' : 'transparent',
              borderLeft: router.pathname === item.href ? '3px solid var(--water-light)' : '3px solid transparent',
            }}>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 8 }}>
          <a href="/" target="_blank" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
            🌐 Visa bokningssidan →
          </a>
        </div>
        <div style={{ padding: '8px 20px 16px' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{user.email}</div>
          <button onClick={logout} style={{
            width: '100%', padding: '7px 0', background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12,
          }}>
            Logga ut
          </button>
        </div>
      </aside>

      <main style={{ marginLeft: 220, flex: 1, padding: '32px 36px', maxWidth: 1200 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 24, color: 'var(--ink)' }}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
