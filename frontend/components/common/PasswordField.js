import { useState } from 'react';

const LABELS = {
  sv: { show:'Visa lösenord', hide:'Dölj lösenord', generate:'Föreslå lösenord', heading:'Lösenordet behöver:',
        r10:'minst 10 tecken', up:'en stor bokstav', low:'en liten bokstav', dig:'en siffra', spec:'ett specialtecken' },
  en: { show:'Show password', hide:'Hide password', generate:'Suggest password', heading:'Password must have:',
        r10:'at least 10 characters', up:'an uppercase letter', low:'a lowercase letter', dig:'a digit', spec:'a special character' },
  de: { show:'Passwort zeigen', hide:'Passwort verbergen', generate:'Passwort vorschlagen', heading:'Das Passwort braucht:',
        r10:'mindestens 10 Zeichen', up:'einen Großbuchstaben', low:'einen Kleinbuchstaben', dig:'eine Ziffer', spec:'ein Sonderzeichen' },
};

const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

export function isStrongPassword(v) {
  return v.length >= 10 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && SPECIAL_RE.test(v);
}

// Genererar alltid ett giltigt lösenord (en av varje klass + slumpat resten), utan tvetydiga tecken.
export function generatePassword(len = 14) {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%^&*';
  const all = U + L + D + S;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(U), pick(L), pick(D), pick(S)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default function PasswordField({
  value = '', onChange, placeholder, style, lang = 'sv',
  showRequirements = false, showGenerate = false, autoComplete = 'new-password',
}) {
  const [visible, setVisible] = useState(false);
  const L = LABELS[lang] || LABELS.sv;

  const checks = [
    { ok: value.length >= 10, label: L.r10 },
    { ok: /[A-Z]/.test(value), label: L.up },
    { ok: /[a-z]/.test(value), label: L.low },
    { ok: /[0-9]/.test(value), label: L.dig },
    { ok: SPECIAL_RE.test(value), label: L.spec },
  ];

  const doGenerate = () => { onChange(generatePassword()); setVisible(true); };

  const eyeBtn = { position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none',
    border:'none', cursor:'pointer', padding:4, color:'var(--ink-light)', display:'flex', alignItems:'center' };

  return (
    <div>
      <div style={{ position:'relative' }}>
        <input type={visible ? 'text' : 'password'} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
          style={{ ...style, paddingRight: 38 }} />
        <button type="button" onClick={() => setVisible((v) => !v)} title={visible ? L.hide : L.show}
          aria-label={visible ? L.hide : L.show} style={eyeBtn}>
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
        </button>
      </div>

      {showGenerate && (
        <button type="button" onClick={doGenerate}
          style={{ background:'none', border:'none', color:'var(--water)', fontSize:12, cursor:'pointer', padding:'4px 0', marginTop:2 }}>
          🎲 {L.generate}
        </button>
      )}

      {showRequirements && value.length > 0 && (
        <div style={{ marginTop:6, marginBottom:8, fontSize:11.5, lineHeight:1.5 }}>
          <div style={{ color:'var(--ink-light)', marginBottom:2 }}>{L.heading}</div>
          {checks.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6, color: c.ok ? 'var(--forest)' : 'var(--ink-pale)' }}>
              <span style={{ width:12, display:'inline-block' }}>{c.ok ? '✓' : '○'}</span>{c.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
