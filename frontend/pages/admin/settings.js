import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const SETTINGS = [
  { key: 'property_name',    label: 'Stugans namn',     type: 'text' },
  { key: 'property_address', label: 'Adress',            type: 'text' },
  { key: 'checkin_time',     label: 'Incheckningstid',   type: 'text' },
  { key: 'checkout_time',    label: 'Utcheckningstid',   type: 'text' },
  { key: 'max_guests',       label: 'Max antal gäster',  type: 'text' },
  { key: 'swish_number',     label: 'Swish-nummer',      type: 'text' },
  { key: 'email_provider',   label: 'E-postleverantör',  type: 'select',
    options: [
      { value: 'mailersend', label: 'Mailersend (primär)' },
      { value: 'brevo',      label: 'Brevo SMTP (backup)' },
    ]
  },
  { key: 'attach_terms_pdf', label: 'Bifoga villkor som PDF i bekräftelsemail', type: 'select',
    options: [
      { value: 'false', label: 'Nej' },
      { value: 'true',  label: 'Ja' },
    ]
  },
  { key: 'booking_ref_style', label: 'Bokningsreferens-stil', type: 'select',
    options: [
      { value: 'sequential', label: 'Löpnummer (0001, 0002...)' },
      { value: 'random',     label: 'Slumpmässigt (4 siffror)' },
    ]
  },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [editing, setEditing]   = useState({});
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    adminApi.getSettings().then(r => {
      setSettings(r.data);
      setEditing(r.data);
    }).catch(() => {});
  }, []);

  const save = async (key) => {
    try {
      await adminApi.updateSetting(key, editing[key]);
      setSettings(s => ({ ...s, [key]: editing[key] }));
      setMsg(`"${SETTINGS.find(s => s.key === key)?.label || key}" sparat!`);
    } catch (e) {
      setMsg('Fel: ' + e.message);
    }
  };

  return (
    <>
      <Head><title>Inställningar — Admin Sjölyckan</title></Head>
      <AdminLayout title="Inställningar">
        {msg && (
          <div style={msgBox}>
            {msg}
            <button onClick={() => setMsg('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
          </div>
        )}
        <div style={{ maxWidth: 600 }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--sand-dark)', overflow: 'hidden' }}>
            {SETTINGS.map((s, i) => (
              <div key={s.key} style={{ padding: '16px 20px', borderBottom: i < SETTINGS.length - 1 ? '1px solid var(--sand)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-pale)', marginBottom: 4 }}>{s.label}</div>
                  {s.type === 'select' ? (
                    <select
                      value={editing[s.key] || s.options[0].value}
                      onChange={e => setEditing(prev => ({ ...prev, [s.key]: e.target.value }))}
                      style={{ padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 14, background: 'white', width: '100%' }}
                    >
                      {s.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={editing[s.key] || ''}
                      onChange={e => setEditing(prev => ({ ...prev, [s.key]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--sand-dark)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' }}
                    />
                  )}
                </div>
                <button
                  onClick={() => save(s.key)}
                  style={{ padding: '8px 16px', background: 'var(--water)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
                >
                  Spara
                </button>
              </div>
            ))}
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const msgBox = {
  background: 'var(--water-pale)', border: '1px solid var(--water)',
  borderRadius: 'var(--radius-md)', padding: '10px 16px',
  marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between',
};

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
