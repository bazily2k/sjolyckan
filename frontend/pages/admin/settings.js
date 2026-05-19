import { useState, useEffect } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi } from '../../lib/api';

const SETTING_LABELS = {
  property_name: 'Stugans namn',
  property_address: 'Adress',
  checkin_time: 'Incheckningstid',
  checkout_time: 'Utcheckningstid',
  max_guests: 'Max antal gäster',
  swish_number: 'Swish-nummer',
  about_title_sv: 'Om-rubrik (svenska)',
  about_title_en: 'Om-rubrik (engelska)',
  about_title_de: 'Om-rubrik (tyska)',
  amenities_title_sv: 'Bekvämligheter-rubrik (svenska)',
  amenities_title_en: 'Bekvämligheter-rubrik (engelska)',
  amenities_title_de: 'Bekvämligheter-rubrik (tyska)',
  sleep_title_sv: 'Sovrum-rubrik (svenska)',
  sleep_title_en: 'Sovrum-rubrik (engelska)',
  sleep_title_de: 'Sovrum-rubrik (tyska)',
  rules_title_sv: 'Husregler-rubrik (svenska)',
  rules_title_en: 'Husregler-rubrik (engelska)',
  rules_title_de: 'Husregler-rubrik (tyska)',
};

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [editing, setEditing] = useState({});
  const [msg, setMsg] = useState('');

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
      setMsg(`"${SETTING_LABELS[key] || key}" sparat!`);
    } catch (e) {
      setMsg('Fel: ' + e.message);
    }
  };

  return (
    <>
      <Head><title>Inställningar — Admin Sjölyckan</title></Head>
      <AdminLayout title="Inställningar">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={{ border:'none', background:'none', cursor:'pointer' }}>×</button></div>}

        <div style={{ maxWidth: 600 }}>
          <div style={{ background:'white', borderRadius:'var(--radius-lg)', border:'1px solid var(--sand-dark)', overflow:'hidden' }}>
            {Object.entries(SETTING_LABELS).map(([key, label], i) => (
              <div key={key} style={{ padding:'16px 20px', borderBottom: i < Object.keys(SETTING_LABELS).length - 1 ? '1px solid var(--sand)' : 'none', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'var(--ink-pale)', marginBottom:4 }}>{label}</div>
                  <input
                    value={editing[key] || ''}
                    onChange={e => setEditing(s => ({ ...s, [key]: e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:14, outline:'none' }}
                  />
                </div>
                <button onClick={() => save(key)} style={{ padding:'8px 16px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, fontWeight:500, whiteSpace:'nowrap' }}>
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

const msgBox = { background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'10px 16px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
