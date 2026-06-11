import { useState, useEffect } from 'react';

export default function CollapsibleSection({
  title, defaultOpen = true, children, badge, style, noPad = false, storageKey,
}) {
  // Nyckel för att minnas öppet/stängt-läge mellan sessioner (per webbläsare)
  const key = 'collapse:' + (storageKey || title);
  const [open, setOpen] = useState(defaultOpen);

  // Läs sparat läge efter mount (SSR-säkert)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === 'open') setOpen(true);
      else if (saved === 'closed') setOpen(false);
    } catch (e) { /* localStorage blockerad — ignorera */ }
  }, [key]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { window.localStorage.setItem(key, next ? 'open' : 'closed'); } catch (e) {}
      return next;
    });
  };

  return (
    <div style={{
      border: '1px solid var(--sand-dark)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginBottom: 20,
      background: 'white',
      ...style,
    }}>
      {/* Header — alltid synlig, klickbar */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => e.key === 'Enter' && toggle()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 16px',
          background: open ? '#f0f4f8' : '#e2e8f0',
          borderBottom: open ? '1px solid var(--sand-dark)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {title}
          </span>
          {badge !== undefined && (
            <span style={{ fontSize: 11, background: 'var(--water-pale)', color: 'var(--water)', borderRadius: 10, padding: '1px 7px', fontWeight: 500 }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Innehåll — display:none för att undvika hydration-problem */}
      <div style={{ display: open ? 'block' : 'none', padding: noPad ? 0 : 16 }}>
        {children}
      </div>
    </div>
  );
}
