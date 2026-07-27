import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

const emptyContact = () => ({ name: '', email: '', mobile: '', is_primary: false });
const emptyForm = () => ({ name: '', url: '', notes: '', is_active: true, contacts: [emptyContact()] });

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null); // id of agent being edited
  const [msg, setMsg] = useState('');

  const load = () => adminApi.listAgents().then(r => setAgents(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const setContact = (idx, field, value) => {
    setForm(f => {
      const contacts = f.contacts.map((c, i) => {
        if (i !== idx) {
          // Endast en kontaktperson kan vara huvudkontakt.
          return field === 'is_primary' && value ? { ...c, is_primary: false } : c;
        }
        return { ...c, [field]: value };
      });
      return { ...f, contacts };
    });
  };

  const addContact = () => setForm(f => ({ ...f, contacts: [...f.contacts, emptyContact()] }));
  const removeContact = (idx) => setForm(f => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!form.name.trim()) { setMsg('Ange ett namn'); return; }
    const contacts = form.contacts.filter(c => c.name.trim() || c.email.trim() || c.mobile.trim());
    const payload = { ...form, contacts };
    try {
      if (editing) {
        await adminApi.updateAgent(editing, payload);
        setMsg('Uppdaterat!');
      } else {
        await adminApi.createAgent(payload);
        setMsg('Sparat!');
      }
      setForm(emptyForm());
      setEditing(null);
      load();
    } catch (e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setForm({
      name: a.name, url: a.url || '', notes: a.notes || '', is_active: a.is_active,
      contacts: a.contacts && a.contacts.length ? a.contacts : [emptyContact()],
    });
    setMsg('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm());
    setMsg('');
  };

  const del = async (id) => {
    if (!confirm('Ta bort förmedlare?')) return;
    try { await adminApi.deleteAgent(id); load(); }
    catch (e) { setMsg('Fel: ' + (e.response?.data?.detail || e.message)); }
  };

  const inp = { width: '100%', padding: '8px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };

  return (
    <AdminLayout title="Förmedlare">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

        {/* Lista */}
        <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sand-dark)', fontSize: 14, fontWeight: 500 }}>
            Förmedlare
          </div>
          {agents.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--ink-pale)', fontSize: 13 }}>Inga förmedlare tillagda än.</div>
          ) : (
            agents.map(a => {
              const primary = (a.contacts || []).find(c => c.is_primary) || (a.contacts || [])[0];
              return (
                <div key={a.id} style={{
                  padding: '14px 16px', borderTop: '1px solid var(--sand)',
                  background: editing === a.id ? 'var(--water-pale)' : 'white',
                  opacity: a.is_active ? 1 : 0.55,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {a.name} {!a.is_active && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 400 }}>(inaktiv)</span>}
                      </div>
                      {a.url && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--water)' }}>{a.url}</a>
                        </div>
                      )}
                      {primary && (
                        <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 4 }}>
                          ★ {primary.name || '–'}
                          {primary.email && <> · {primary.email}</>}
                          {primary.mobile && <> · {primary.mobile}</>}
                        </div>
                      )}
                      {a.contacts && a.contacts.length > 1 && (
                        <div style={{ fontSize: 11, color: 'var(--ink-pale)', marginTop: 2 }}>
                          + {a.contacts.length - 1} till kontaktperson{a.contacts.length - 1 > 1 ? 'er' : ''}
                        </div>
                      )}
                      {a.notes && <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginTop: 4 }}>{a.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(a)}
                        style={{ padding: '4px 10px', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12 }}>
                        ✏️ Redigera
                      </button>
                      <button onClick={() => del(a.id)}
                        style={{ padding: '4px 10px', background: 'white', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12 }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Formulär */}
        <div style={{ background: 'white', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
            {editing ? '✏️ Redigera förmedlare' : '+ Lägg till förmedlare'}
          </div>
          {msg && <div style={{ padding: '8px 12px', background: 'var(--water-pale)', border: '1px solid var(--water)', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Namn</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="t.ex. Airbnb, Booking.com" style={inp} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://..." style={inp} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Anteckningar</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="t.ex. provision, villkor" rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Kontaktpersoner</label>
            <button onClick={addContact} type="button"
              style={{ padding: '3px 10px', background: 'var(--sand)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12 }}>
              + Lägg till
            </button>
          </div>
          {form.contacts.map((c, idx) => (
            <div key={idx} style={{ border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="primary-contact" checked={!!c.is_primary}
                    onChange={() => setContact(idx, 'is_primary', true)} />
                  Huvudkontakt
                </label>
                {form.contacts.length > 1 && (
                  <button onClick={() => removeContact(idx)} type="button"
                    style={{ padding: '2px 8px', background: 'white', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 11 }}>
                    Ta bort
                  </button>
                )}
              </div>
              <input value={c.name} onChange={e => setContact(idx, 'name', e.target.value)}
                placeholder="Namn" style={{ ...inp, marginBottom: 6 }} />
              <input value={c.email} onChange={e => setContact(idx, 'email', e.target.value)}
                placeholder="E-post" style={{ ...inp, marginBottom: 6 }} />
              <input value={c.mobile} onChange={e => setContact(idx, 'mobile', e.target.value)}
                placeholder="Mobil" style={inp} />
            </div>
          ))}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '12px 0 16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Aktiv
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save}
              style={{ flex: 1, padding: '9px 0', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
              {editing ? 'Spara ändringar' : 'Lägg till'}
            </button>
            {editing && (
              <button onClick={cancelEdit}
                style={{ padding: '9px 14px', background: 'var(--sand)', color: 'var(--ink)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
                Avbryt
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
