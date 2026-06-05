import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const empty = {
  name_sv: '', name_en: '', name_de: '',
  date_from: '', date_to: '',
  price_per_night: '', deposit_pct: 10, deposit_days: 7, extra_guest_fee: 0, extra_guest_threshold: 4,
  payment_days_before: 60, min_nights: 2,
  reminder_1_days: 14, reminder_2_days: 3,
  cancellation_deposit_days: 30, cancellation_full_days: 14,
  visible: true, active: true, sort_order: 0,
};

function Field({ label, field, type = 'text', half, form, setForm }) {
  return (
    <div style={{ gridColumn: half ? 'auto' : 'span 2' }}>
      <label style={lbl}>{label}</label>
      <input type={type} value={form[field] ?? ''}
        onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        style={inp} />
    </div>
  );
}

export default function AdminSeasons() {
  const [seasons, setSeasons] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => adminApi.listSeasons().then(r => setSeasons(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing) {
        await adminApi.updateSeason(editing, form);
      } else {
        await adminApi.createSeason(form);
      }
      setMsg('Sparat!'); setForm(empty); setEditing(null); load();
    } catch (e) {
      setMsg('Fel: ' + (e.response?.data?.detail || e.message));
    }
  };

  const toggle = async (id) => {
    await adminApi.toggleSeason(id); load();
  };

  const copy = async (id) => {
    try {
      await adminApi.copySeason(id);
      load();
    } catch(e) { alert('Fel: ' + e.message); }
  };

  const del = async (id) => {
    if (!window.confirm('Ta bort säsong?')) return;
    await adminApi.deleteSeason(id); load();
  };

  const edit = (s) => {
    setEditing(s.id);
    setForm({ ...s, date_from: s.date_from, date_to: s.date_to });
  };

  return (
    <>
      <Head><title>Säsonger — Admin Sjölyckan</title></Head>
      <AdminLayout title="Säsonger & priser">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={closeBtn}>×</button></div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          {/* Lista */}
          <div>
            {seasons.map(s => (
              <div key={s.id} style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{s.name_sv}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-pale)' }}>{s.date_from} – {s.date_to}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ ...badge, background: s.active ? '#d4edda' : '#f8d7da', color: s.active ? '#155724' : '#721c24' }}>
                      {s.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <button onClick={() => edit(s)} style={actionBtn}>Redigera</button>
                    <button onClick={() => toggle(s.id)} style={actionBtn}>{s.active ? 'Inaktivera' : 'Aktivera'}</button>
                    <button onClick={() => copy(s.id)} style={{ ...actionBtn }}>Kopiera</button>
                    <button onClick={() => del(s.id)} style={{ ...actionBtn, color: 'var(--red)' }}>Ta bort</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {[
                    ['Pris/natt', `${s.price_per_night} kr`],
                    ['Handpenning', `${s.deposit_pct}%`],
                    ['Betala handp. inom', `${s.deposit_days} dagar`],
                    ['Betalfrist', `${s.payment_days_before} dagar`],
                    ['Min. nätter', s.min_nights],
                    ['Extra gästavgift', s.extra_guest_fee > 0 ? `${s.extra_guest_fee} kr/gäst/natt (över ${s.extra_guest_threshold} pers)` : 'Ingen'],
                    ['Avbokn. handp.', `${s.cancellation_deposit_days || 30} dagar`],
                    ['Avbokn. fullt belopp', `${s.cancellation_full_days || 14} dagar`],
                    ['Påminnelse 1', `${s.reminder_1_days} dagar`],
                    ['Påminnelse 2', `${s.reminder_2_days} dagar`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: 'var(--sand)', borderRadius: 'var(--radius-md)', padding: '6px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--ink-pale)' }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Formulär */}
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', padding: 20, position: 'sticky', top: 80 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, marginBottom: 16 }}>
              {editing ? 'Redigera säsong' : 'Lägg till säsong'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field form={form} setForm={setForm} label="Namn (svenska)" field="name_sv" />
              <Field form={form} setForm={setForm} label="Namn (engelska)" field="name_en" />
              <Field form={form} setForm={setForm} label="Namn (tyska)" field="name_de" />
              <Field form={form} setForm={setForm} label="Från datum" field="date_from" type="date" half />
              <Field form={form} setForm={setForm} label="Till datum" field="date_to" type="date" half />
              <Field form={form} setForm={setForm} label="Pris per natt (kr)" field="price_per_night" type="number" half />
              <Field form={form} setForm={setForm} label="Handpenning (%)" field="deposit_pct" type="number" half />
              <Field form={form} setForm={setForm} label="Betala handp. inom (dagar)" field="deposit_days" type="number" half />
              <Field form={form} setForm={setForm} label="Betalfrist (dagar före ankomst)" field="payment_days_before" type="number" half />
              <Field form={form} setForm={setForm} label="Minsta antal nätter" field="min_nights" type="number" half />
              <Field form={form} setForm={setForm} label="Extra avgift per gäst/natt (kr)" field="extra_guest_fee" type="number" half />
              <Field form={form} setForm={setForm} label="Extra avgift fr.o.m. antal gäster" field="extra_guest_threshold" type="number" half />
              <Field form={form} setForm={setForm} label="Påminnelse 1 (dagar före)" field="reminder_1_days" type="number" half />
              <Field form={form} setForm={setForm} label="Påminnelse 2 (dagar före)" field="reminder_2_days" type="number" half />
              <Field form={form} setForm={setForm} label="Avbokning: handp. återbet. (dagar före ankomst)" field="cancellation_deposit_days" type="number" half />
              <Field form={form} setForm={setForm} label="Avbokning: fullt belopp (dagar före ankomst)" field="cancellation_full_days" type="number" half />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {editing && (
                <button onClick={() => { setEditing(null); setForm(empty); }} style={{ ...saveBtn, background: 'var(--sand)', color: 'var(--ink)' }}>
                  Avbryt
                </button>
              )}
              <button onClick={save} style={saveBtn}>{editing ? 'Spara ändringar' : 'Lägg till'}</button>
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const lbl = { fontSize: 11, fontWeight: 500, color: 'var(--ink-pale)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 3 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none' };
const badge = { fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500 };
const actionBtn = { padding: '4px 10px', border: '1px solid var(--sand-dark)', background: 'white', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12, color: 'var(--ink-light)' };
const saveBtn = { flex: 1, padding: '9px 0', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const msgBox = { background: 'var(--water-pale)', border: '1px solid var(--water)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' };
const closeBtn = { border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
