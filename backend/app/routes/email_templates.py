import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

// ─── Tillgängliga Jinja2-variabler ───────────────────────────────────────────
const VARIABLES = [
  { label: 'Bokningsref',     val: '{{ booking.booking_ref }}' },
  { label: 'Gästens namn',    val: '{{ booking.guest_name }}' },
  { label: 'E-post',          val: '{{ booking.guest_email }}' },
  { label: 'Incheckning',     val: '{{ booking.check_in }}' },
  { label: 'Utcheckning',     val: '{{ booking.check_out }}' },
  { label: 'Antal gäster',    val: '{{ booking.guests_count }}' },
  { label: 'Totalbelopp',     val: '{{ booking.total_amount }}' },
  { label: 'Handpenning',     val: '{{ booking.deposit_amount }}' },
  { label: 'Betalningsdatum', val: '{{ booking.payment_due_date }}' },
  { label: 'Betalningslänk',  val: '{{ frontend_url }}/pay/{{ booking.booking_ref }}' },
  { label: 'Swish-nummer',    val: '{{ swish_number }}' },
  { label: 'Admin-epost',     val: '{{ admin_email }}' },
];

const TRIGGERS = [
  { value: 'booking_request',   label: 'Bokningsförfrågan (auto)' },
  { value: 'booking_confirmed', label: 'Bokningsbekräftelse (auto)' },
  { value: 'booking_rejected',  label: 'Bokning nekad (auto)' },
  { value: 'booking_cancelled', label: 'Avbokning (auto)' },
  { value: 'payment_reminder',  label: 'Betalningspåminnelse (auto)' },
  { value: 'checkin_info',      label: 'Incheckning imorgon (auto)' },
  { value: 'admin_new_booking', label: 'Ny bokning till admin (auto)' },
  { value: 'manual',            label: 'Manuell (knapp i bokningsdetalj)' },
];

// ─── WYSIWYG-editor ───────────────────────────────────────────────────────────
function WysiwygEditor({ value, onChange }) {
  const [htmlMode, setHtmlMode] = useState(false);
  const editorRef = useRef(null);
  const textaRef = useRef(null);
  const lastValue = useRef(value || '');

  useEffect(() => {
    if (!htmlMode && editorRef.current && value !== lastValue.current) {
      editorRef.current.innerHTML = value || '';
      lastValue.current = value || '';
    }
  }, [value, htmlMode]);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    const html = editorRef.current?.innerHTML || '';
    lastValue.current = html;
    onChange(html);
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML || '';
    lastValue.current = html;
    onChange(html);
  };

  const handleHtmlChange = (e) => {
    lastValue.current = e.target.value;
    onChange(e.target.value);
  };

  const toHtmlMode = () => {
    const html = editorRef.current?.innerHTML || '';
    lastValue.current = html;
    onChange(html);
    setHtmlMode(true);
  };

  const toWysiwygMode = () => {
    setHtmlMode(false);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = lastValue.current;
      }
    }, 0);
  };

  const insertVar = (varText) => {
    if (htmlMode) {
      const ta = textaRef.current;
      if (!ta) return;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const newVal = ta.value.slice(0, s) + varText + ta.value.slice(e);
      lastValue.current = newVal;
      onChange(newVal);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + varText.length; ta.focus(); }, 0);
    } else {
      editorRef.current?.focus();
      document.execCommand('insertText', false, varText);
      const html = editorRef.current?.innerHTML || '';
      lastValue.current = html;
      onChange(html);
    }
  };

  const btnStyle = (active = false) => ({
    padding: '3px 8px', border: '1px solid var(--sand-dark)', borderRadius: 4,
    background: active ? 'var(--ink)' : 'white', color: active ? 'white' : 'var(--ink)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
  });

  return (
    <div style={{ border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: 'var(--sand)', borderBottom: '1px solid var(--sand-dark)', flexWrap: 'wrap', alignItems: 'center' }}>
        {!htmlMode && <>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('bold'); }}><strong>B</strong></button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('italic'); }}><em>I</em></button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('underline'); }}><u>U</u></button>
          <span style={{ borderLeft: '1px solid var(--sand-dark)', height: 18, margin: '0 2px' }} />
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('formatBlock', 'h3'); }}>H3</button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}>• Lista</button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}>1. Lista</button>
          <button type="button" style={btnStyle()} onMouseDown={e => {
            e.preventDefault();
            const url = prompt('URL:');
            if (url) exec('createLink', url);
          }}>🔗</button>
          <span style={{ borderLeft: '1px solid var(--sand-dark)', height: 18, margin: '0 2px' }} />
        </>}
        <button type="button" style={{ ...btnStyle(htmlMode), marginLeft: 'auto' }}
          onClick={htmlMode ? toWysiwygMode : toHtmlMode}>
          {htmlMode ? '👁 Visuell' : '🖊 HTML'}
        </button>
      </div>

      {/* Variabel-chips */}
      <div style={{ padding: '6px 10px', background: '#f8f9fa', borderBottom: '1px solid var(--sand-dark)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {VARIABLES.map(v => (
          <button key={v.val} type="button" onClick={() => insertVar(v.val)}
            style={{ padding: '2px 8px', background: 'var(--water-pale)', border: '1px solid var(--water)', borderRadius: 12, fontSize: 11, cursor: 'pointer', color: 'var(--water)' }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Editor / textarea */}
      {!htmlMode ? (
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={handleInput}
          style={{ minHeight: 220, padding: '12px 14px', outline: 'none', fontSize: 14, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: value || '' }} />
      ) : (
        <textarea ref={textaRef} value={value || ''} onChange={handleHtmlChange}
          style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12, padding: '12px 14px', border: 'none', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }} />
      )}
    </div>
  );
}

// ─── Huvud-sida ───────────────────────────────────────────────────────────────
export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [lang, setLang] = useState('sv');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const emptyForm = { name:'', trigger:'manual', recipient:'guest', is_active:true,
    subject_sv:'', subject_en:'', subject_de:'',
    body_sv:'', body_en:'', body_de:'' };

  const load = useCallback(() =>
    adminApi.getEmailTemplates().then(r => setTemplates(r.data)).catch(() => {}), []);

  useEffect(() => { load(); }, []);

  const selectTemplate = (t) => {
    setSelected(t); setForm({ ...t }); setCreating(false); setMsg(''); setLang('sv');
  };

  const startCreate = () => {
    setSelected(null); setForm({ ...emptyForm }); setCreating(true); setMsg(''); setLang('sv');
  };

  const saveForm = async () => {
    if (!form.name) { setMsg('Ange ett namn.'); return; }
    setLoading(true);
    try {
      if (creating) {
        const r = await adminApi.createEmailTemplate(form);
        setMsg('Mall skapad!'); await load(); selectTemplate(r.data);
      } else {
        await adminApi.updateEmailTemplate(selected.id, form);
        setMsg('Sparad!'); await load();
      }
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
    finally { setLoading(false); }
  };

  const toggle = async () => {
    try {
      const r = await adminApi.toggleEmailTemplate(selected.id);
      setForm(f => ({ ...f, is_active: r.data.is_active }));
      setMsg(r.data.is_active ? 'Aktiverad.' : 'Inaktiverad.');
      await load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const reset = async () => {
    if (!confirm('Återställ till orginalinnehållet från filen?')) return;
    try {
      const r = await adminApi.resetEmailTemplate(selected.id);
      setForm({ ...r.data }); setMsg('Återställd till standard.'); await load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const deleteTemplate = async () => {
    if (!confirm('Ta bort mallen?')) return;
    try {
      await adminApi.deleteEmailTemplate(selected.id);
      setSelected(null); setForm(null); setCreating(false); setMsg('Borttagen.'); await load();
    } catch(e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const setBody = (val) => setForm(f => ({ ...f, [`body_${lang}`]: val }));
  const setSubject = (val) => setForm(f => ({ ...f, [`subject_${lang}`]: val }));

  // ─── Stilar ────────────────────────────────────────────────────────────────
  const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:11, fontWeight:500, color:'var(--ink-light)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 };
  const tabBtn = (active) => ({ padding:'7px 16px', border:'none', borderBottom: active ? '2px solid var(--water)' : '2px solid transparent', background:'none', cursor:'pointer', fontSize:13, fontWeight: active ? 600 : 400, color: active ? 'var(--water)' : 'var(--ink-pale)' });

  // ─── Trigger-grupper ────────────────────────────────────────────────────────
  const autoTmpl = templates.filter(t => t.trigger !== 'manual');
  const manualTmpl = templates.filter(t => t.trigger === 'manual');

  return (
    <AdminLayout title="Mailmallar">
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:24, alignItems:'start' }}>

        {/* ─── Vänster: mallista ─── */}
        <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--sand-dark)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, fontWeight:500 }}>Mallar</span>
            <button onClick={startCreate}
              style={{ padding:'4px 10px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12 }}>
              + Ny
            </button>
          </div>
          {[['⚙️ Automatiska', autoTmpl], ['✋ Manuella', manualTmpl]].map(([title, list]) => (
            <div key={title}>
              <div style={{ padding:'6px 16px', fontSize:11, fontWeight:600, color:'var(--ink-pale)', background:'var(--sand)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{title}</div>
              {list.map(t => (
                <div key={t.id} onClick={() => selectTemplate(t)}
                  style={{ padding:'10px 16px', cursor:'pointer', borderBottom:'1px solid var(--sand)', background: selected?.id === t.id ? 'var(--water-pale)' : 'white', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight: selected?.id === t.id ? 600 : 400 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'var(--ink-pale)', marginTop:1 }}>{TRIGGERS.find(x=>x.value===t.trigger)?.label.replace(' (auto)','').replace(' (knapp i bokningsdetalj)','') || t.trigger}</div>
                  </div>
                  {!t.is_active && <span style={{ fontSize:10, color:'var(--ink-pale)', background:'var(--sand-dark)', borderRadius:8, padding:'1px 6px' }}>Av</span>}
                </div>
              ))}
              {list.length === 0 && <div style={{ padding:'12px 16px', fontSize:12, color:'var(--ink-pale)' }}>Inga ännu.</div>}
            </div>
          ))}
        </div>

        {/* ─── Höger: editor ─── */}
        {form ? (
          <div>
            {msg && <div style={{ padding:'10px 14px', background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', marginBottom:16, fontSize:13 }}>{msg}</div>}

            <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', padding:20, marginBottom:20 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={lbl}>Mallnamn</label>
                  <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} style={inp} placeholder="T.ex. Berätta vem du är" />
                </div>
                <div>
                  <label style={lbl}>Trigger</label>
                  <select value={form.trigger} onChange={e => setForm(f=>({...f,trigger:e.target.value}))}
                    disabled={form.is_system} style={{ ...inp, background:'white' }}>
                    {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                  <input type="radio" checked={form.recipient==='guest'} onChange={()=>setForm(f=>({...f,recipient:'guest'}))} /> Till gäst
                </label>
                <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                  <input type="radio" checked={form.recipient==='admin'} onChange={()=>setForm(f=>({...f,recipient:'admin'}))} /> Till admin
                </label>
                {form.is_system && <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-pale)', background:'var(--sand)', padding:'2px 8px', borderRadius:8 }}>Systemmall</span>}
              </div>
            </div>

            {/* Språkflikar */}
            <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
              <div style={{ display:'flex', borderBottom:'1px solid var(--sand-dark)' }}>
                {['sv','en','de'].map(l => (
                  <button key={l} type="button" style={tabBtn(lang===l)} onClick={()=>setLang(l)}>
                    {l==='sv'?'🇸🇪 Svenska':l==='en'?'🇬🇧 English':'🇩🇪 Deutsch'}
                  </button>
                ))}
              </div>
              <div style={{ padding:16 }}>
                <div style={{ marginBottom:12 }}>
                  <label style={lbl}>Ämnesrad</label>
                  <input value={form[`subject_${lang}`] || ''} onChange={e => setSubject(e.target.value)} style={inp} placeholder="T.ex. Välkommen till Sjölyckan, {{ booking.guest_name }}!" />
                </div>
                <div>
                  <label style={lbl}>Innehåll</label>
                  <WysiwygEditor key={`${selected?.id || 'new'}-${lang}`}
                    value={form[`body_${lang}`] || ''}
                    onChange={setBody} />
                  {form.is_system && <p style={{ fontSize:11, color:'var(--ink-pale)', marginTop:8 }}>⚠️ Systemmall med avancerad Jinja2-logik — använd HTML-läget om du redigerar mallkod som <code>{'{% if %}'}</code>.</p>}
                </div>
              </div>
            </div>

            {/* Knappar */}
            <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
              <button onClick={saveForm} disabled={loading}
                style={{ padding:'9px 20px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontWeight:500, fontSize:13 }}>
                {loading ? 'Sparar…' : creating ? 'Skapa mall' : 'Spara'}
              </button>
              {!creating && <>
                <button onClick={toggle}
                  style={{ padding:'9px 16px', background:'white', color:'var(--ink)', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                  {form.is_active ? 'Inaktivera' : 'Aktivera'}
                </button>
                {form.is_system && (
                  <button onClick={reset}
                    style={{ padding:'9px 16px', background:'white', color:'var(--ink)', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13 }}>
                    ↩ Återställ standard
                  </button>
                )}
                {!form.is_system && (
                  <button onClick={deleteTemplate}
                    style={{ padding:'9px 16px', background:'white', color:'var(--red)', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, marginLeft:'auto' }}>
                    🗑 Ta bort
                  </button>
                )}
              </>}
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'var(--ink-pale)', fontSize:14 }}>
            Välj en mall till vänster eller skapa en ny.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
