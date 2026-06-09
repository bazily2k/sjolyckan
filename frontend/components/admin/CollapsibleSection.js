import { useState } from 'react';

/**
 * CollapsibleSection — en hopfällbar ruta för admin-sidor.
 *
 * Props:
 *   title       (string)  — rubrik i header
 *   defaultOpen (bool)    — öppen som standard, default true
 *   children              — innehållet
 *   badge       (string)  — valfri liten etikett bredvid titeln (t.ex. antal)
 *   style       (object)  — extra stilar på ytterdiven
 *   noPad       (bool)    — om true: inget padding på innehållet (t.ex. tabeller)
 */
export default function CollapsibleSection({
  title, defaultOpen = true, children, badge, style, noPad = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--sand-dark)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginBottom: 20,
      ...style,
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: open ? 'white' : 'var(--sand)',
          border: 'none', borderBottom: open ? '1px solid var(--sand-dark)' : 'none',
          cursor: 'pointer', textAlign: 'left', gap: 8,
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
            {title}
          </span>
          {badge !== undefined && (
            <span style={{ fontSize: 11, background: 'var(--water-pale)', color: 'var(--water)', borderRadius: 10, padding: '1px 7px', fontWeight: 500 }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-pale)', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={noPad ? undefined : { padding: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}
