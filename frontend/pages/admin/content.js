import { useState, useEffect, useRef } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import AdminLayout from '../../components/admin/AdminLayout';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const CONTENT_LABELS = {
  hero_title: 'Hero-rubrik',
  hero_subtitle: 'Hero-underrubrik',
  hero_tagline: 'Hero-tagline',
  about_title: 'Om-rubrik',
  about_text: 'Om-text (lång beskrivning)',
  capacity: 'Kapacitet (t.ex. 8 gäster · 4 sovrum...)',
  amenities_title: 'Bekvämligheter-rubrik',
  sleep_title: 'Var du sover-rubrik',
  rules_title: 'Husregler-rubrik',
  checkin_rule: 'Husregel: Incheckning',
  checkout_rule: 'Husregel: Utcheckning',
  max_guests_rule: 'Husregel: Max gäster',
  linen_rule: 'Husregel: Sängkläder',
  pets_rule: 'Husregel: Husdjur',
  cleaning_rule: 'Husregel: Städning',
};

export default function AdminCMS() {
  const [tab, setTab] = useState('content');
  const [content, setContent] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [msg, setMsg] = useState('');
  const [editingRoom, setEditingRoom] = useState(null);
  const [expandedRoom, setExpandedRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({ name_sv:'', name_en:'', name_de:'', desc_sv:'', desc_en:'', desc_de:'', beds_sv:'', beds_en:'', beds_de:'', sort_order:0 });
  const [roomImage, setRoomImage] = useState(null);
  const [roomExtraImage, setRoomExtraImage] = useState(null);
  const [galleryImage, setGalleryImage] = useState(null);
  const [galleryForm, setGalleryForm] = useState({ alt_sv:'', use_in_hero:true, use_in_gallery:true, sort_order:0 });
  const fileRef = useRef();
  const extraFileRef = useRef();
  const galleryRef = useRef();

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token") || ""}` });
  

  const load = async () => {
    try {
      const [c, r, g] = await Promise.all([
        axios.get(`${API}/cms/admin/content`, { headers: getHeaders() }),
        axios.get(`${API}/cms/admin/rooms`, { headers: getHeaders() }),
        axios.get(`${API}/cms/admin/gallery`, { headers: getHeaders() }),
      ]);
      setContent(c.data);
      setRooms(r.data);
      setGallery(g.data);
    } catch (e) {
      setMsg('Fel: ' + e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const saveContent = async (block) => {
    try {
      await axios.put(`${API}/cms/admin/content/${block.key}`, null, {
        headers: getHeaders(),
        params: { value_sv: block.value_sv||'', value_en: block.value_en||'', value_de: block.value_de||'' },
      });
      setMsg(`Sparat!`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg('Fel: ' + e.message); }
  };

  const saveRoom = async () => {
    const fd = new FormData();
    Object.entries(roomForm).forEach(([k, v]) => fd.append(k, v));
    if (roomImage) fd.append('image', roomImage);
    try {
      if (editingRoom) {
        await axios.put(`${API}/cms/admin/rooms/${editingRoom}`, fd, { headers: { ...getHeaders(), "Content-Type": undefined } });
      } else {
        console.log("Token:", localStorage.getItem("token")?.slice(0,20));
      await axios.post(`${API}/cms/admin/rooms`, fd, { headers: { ...getHeaders(), "Content-Type": undefined } });
      }
      setMsg('Rum sparat!');
      setEditingRoom(null);
      setRoomForm({ name_sv:'', name_en:'', name_de:'', desc_sv:'', desc_en:'', desc_de:'', beds_sv:'', beds_en:'', beds_de:'', sort_order:0 });
      setRoomImage(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) { setMsg('Fel: ' + e.message); }
  };

  const addRoomImage = async (roomId) => {
    if (!roomExtraImage) return;
    const fd = new FormData();
    fd.append('image', roomExtraImage);
    fd.append('caption_sv', '');
    try {
      await axios.post(`${API}/cms/admin/rooms/${roomId}/images`, fd, { headers: getHeaders() });
      setMsg('Bild tillagd!');
      setRoomExtraImage(null);
      if (extraFileRef.current) extraFileRef.current.value = '';
      load();
    } catch (e) { setMsg('Fel: ' + e.message); }
  };

  const deleteRoomImage = async (roomId, imageId) => {
    if (!window.confirm('Ta bort bild?')) return;
    await axios.delete(`${API}/cms/admin/rooms/${roomId}/images/${imageId}`, { headers: getHeaders() });
    setMsg('Bild borttagen.'); load();
  };

  const deleteRoom = async (id) => {
    if (!window.confirm('Ta bort rum?')) return;
    await axios.delete(`${API}/cms/admin/rooms/${id}`, { headers: getHeaders() });
    setMsg('Rum borttaget.'); load();
  };

  const uploadGallery = async () => {
    if (!galleryImage) return;
    const fd = new FormData();
    fd.append('image', galleryImage);
    fd.append('alt_sv', galleryForm.alt_sv);
    fd.append('use_in_hero', galleryForm.use_in_hero);
    fd.append('use_in_gallery', galleryForm.use_in_gallery);
    fd.append('sort_order', galleryForm.sort_order);
    try {
      await axios.post(`${API}/cms/admin/gallery`, fd, { headers: getHeaders() });
      setMsg('Bild uppladdad!');
      setGalleryImage(null);
      if (galleryRef.current) galleryRef.current.value = '';
      load();
    } catch (e) { setMsg('Fel: ' + e.message); }
  };

  const deleteGalleryImage = async (id) => {
    if (!window.confirm('Ta bort bild?')) return;
    await axios.delete(`${API}/cms/admin/gallery/${id}`, { headers: getHeaders() });
    setMsg('Bild borttagen.'); load();
  };

  const toggleGalleryImg = async (id, field, val) => {
    await axios.patch(`${API}/cms/admin/gallery/${id}`, null, { headers: getHeaders(), params: { [field]: !val } });
    load();
  };

  return (
    <>
      <Head><title>Innehåll — Admin Sjölyckan</title></Head>
      <AdminLayout title="Innehåll & bilder">
        {msg && <div style={msgBox}>{msg} <button onClick={() => setMsg('')} style={{ border:'none', background:'none', cursor:'pointer' }}>×</button></div>}

        {/* Tabbar */}
        <div style={{ display:'flex', gap:0, marginBottom:24, borderBottom:'1px solid var(--sand-dark)' }}>
          {[['content','✏️ Texter'],['rooms','🛏 Rum & bilder'],['gallery','🖼 Bildgalleri']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding:'10px 20px', border:'none', background:'transparent', cursor:'pointer',
              fontSize:14, fontWeight: tab===key ? 500 : 400,
              color: tab===key ? 'var(--water)' : 'var(--ink-light)',
              borderBottom: tab===key ? '2px solid var(--water)' : '2px solid transparent',
              marginBottom:-1,
            }}>{label}</button>
          ))}
        </div>

        {/* ── TEXTER ── */}
        {tab === 'content' && (
          <div style={{ maxWidth:800 }}>
            {content.map(block => (
              <div key={block.key} style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', padding:20, marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:12 }}>
                  {CONTENT_LABELS[block.key] || block.key}
                </div>
                {['sv','en','de'].map(lang => (
                  <div key={lang} style={{ marginBottom:8 }}>
                    <div style={{ fontSize:11, color:'var(--ink-pale)', marginBottom:3 }}>
                      {lang==='sv'?'🇸🇪 Svenska':lang==='en'?'🇬🇧 English':'🇩🇪 Deutsch'}
                    </div>
                    {(block[`value_${lang}`]||'').length > 60 ? (
                      <textarea value={block[`value_${lang}`]||''} onChange={e => setContent(c => c.map(b => b.key===block.key ? {...b,[`value_${lang}`]:e.target.value} : b))}
                        style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, resize:'vertical', height:80, outline:'none' }} />
                    ) : (
                      <input value={block[`value_${lang}`]||''} onChange={e => setContent(c => c.map(b => b.key===block.key ? {...b,[`value_${lang}`]:e.target.value} : b))}
                        style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' }} />
                    )}
                  </div>
                ))}
                <button onClick={() => saveContent(block)} style={saveBtn}>Spara</button>
              </div>
            ))}
          </div>
        )}

        {/* ── RUM ── */}
        {tab === 'rooms' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:24, alignItems:'start' }}>
            <div>
              {rooms.map(r => (
                <div key={r.id} style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', marginBottom:12, overflow:'hidden' }}>
                  <div style={{ padding:16, display:'flex', gap:12, alignItems:'center' }}>
                    {r.image_path ? (
                      <img src={r.image_path} alt={r.name} style={{ width:80, height:60, objectFit:'cover', borderRadius:'var(--radius-md)' }} />
                    ) : (
                      <div style={{ width:80, height:60, background:'var(--sand)', borderRadius:'var(--radius-md)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🛏</div>
                    )}
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500 }}>{r.name}</div>
                      <div style={{ fontSize:12, color:'var(--ink-pale)' }}>{r.beds} · {r.images?.length || 0} extra bilder</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => setExpandedRoom(expandedRoom === r.id ? null : r.id)} style={actionBtn}>
                        {expandedRoom === r.id ? '▲ Bilder' : '▼ Bilder'}
                      </button>
                      <button onClick={() => { setEditingRoom(r.id); setRoomForm({ name_sv:r.name_sv||r.name, name_en:r.name_en||r.name, name_de:r.name_de||r.name, desc_sv:r.desc_sv||'', desc_en:r.desc_en||'', desc_de:r.desc_de||'', beds_sv:r.beds_sv||r.beds||'', beds_en:r.beds_en||r.beds||'', beds_de:r.beds_de||r.beds||'', sort_order:r.sort_order }); }} style={actionBtn}>Redigera</button>
                      <button onClick={() => deleteRoom(r.id)} style={{ ...actionBtn, color:'var(--red)' }}>Ta bort</button>
                    </div>
                  </div>

                  {/* Bildhantering per rum */}
                  {expandedRoom === r.id && (
                    <div style={{ borderTop:'1px solid var(--sand)', padding:16, background:'var(--sand)' }}>
                      <div style={{ fontSize:12, fontWeight:500, color:'var(--ink-pale)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.3px' }}>Bilder för {r.name}</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                        {r.images?.map(img => (
                          <div key={img.id} style={{ position:'relative' }}>
                            <img src={img.image_path} alt="" style={{ width:80, height:60, objectFit:'cover', borderRadius:'var(--radius-md)' }} />
                            <button onClick={() => deleteRoomImage(r.id, img.id)} style={{ position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:'50%', background:'var(--red)', color:'white', border:'none', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                          </div>
                        ))}
                        {(!r.images || r.images.length === 0) && (
                          <p style={{ fontSize:13, color:'var(--ink-pale)' }}>Inga extra bilder.</p>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input type="file" accept="image/*" ref={extraFileRef} onChange={e => setRoomExtraImage(e.target.files[0])} style={{ fontSize:12 }} />
                        <button onClick={() => addRoomImage(r.id)} disabled={!roomExtraImage} style={{ ...saveBtn, opacity: roomExtraImage ? 1 : 0.5, padding:'6px 14px', fontSize:12 }}>
                          + Lägg till bild
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Formulär */}
            <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', padding:20, position:'sticky', top:80 }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:16 }}>
                {editingRoom ? 'Redigera rum' : 'Lägg till rum'}
              </h3>
              {[['Namn (sv)','name_sv'],['Namn (en)','name_en'],['Namn (de)','name_de'],
                ['Sängar (sv)','beds_sv'],['Sängar (en)','beds_en'],['Sängar (de)','beds_de']].map(([label, field]) => (
                <div key={field} style={{ marginBottom:8 }}>
                  <label style={lbl}>{label}</label>
                  <input value={roomForm[field]} onChange={e => setRoomForm(f => ({...f,[field]:e.target.value}))} style={inp} />
                </div>
              ))}
              {[['Beskrivning (sv)','desc_sv'],['Beskrivning (en)','desc_en'],['Beskrivning (de)','desc_de']].map(([label, field]) => (
                <div key={field} style={{ marginBottom:8 }}>
                  <label style={lbl}>{label}</label>
                  <textarea value={roomForm[field]} onChange={e => setRoomForm(f => ({...f,[field]:e.target.value}))} style={{ ...inp, height:50, resize:'none' }} />
                </div>
              ))}
              <div style={{ marginBottom:8 }}>
                <label style={lbl}>Sorteringsordning</label>
                <input type="number" value={roomForm.sort_order} onChange={e => setRoomForm(f => ({...f,sort_order:Number(e.target.value)}))} style={inp} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>Huvudbild</label>
                <input type="file" accept="image/*" ref={fileRef} onChange={e => setRoomImage(e.target.files[0])} style={{ fontSize:12 }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {editingRoom && <button onClick={() => { setEditingRoom(null); setRoomForm({ name_sv:'', name_en:'', name_de:'', desc_sv:'', desc_en:'', desc_de:'', beds_sv:'', beds_en:'', beds_de:'', sort_order:0 }); }} style={{ ...saveBtn, background:'var(--sand)', color:'var(--ink)' }}>Avbryt</button>}
                <button onClick={saveRoom} style={saveBtn}>{editingRoom ? 'Spara' : 'Lägg till'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── GALLERI ── */}
        {tab === 'gallery' && (
          <div>
            <div style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', padding:20, marginBottom:24 }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:16 }}>Ladda upp ny bild</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={lbl}>Bild (max 8MB)</label>
                  <input type="file" accept="image/*" ref={galleryRef} onChange={e => setGalleryImage(e.target.files[0])} style={{ fontSize:12 }} />
                </div>
                <div>
                  <label style={lbl}>Bildtext (sv)</label>
                  <input value={galleryForm.alt_sv} onChange={e => setGalleryForm(f => ({...f,alt_sv:e.target.value}))} style={inp} placeholder="t.ex. Utsikt från bryggan" />
                </div>
              </div>
              <div style={{ display:'flex', gap:16, marginBottom:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={galleryForm.use_in_hero} onChange={e => setGalleryForm(f => ({...f,use_in_hero:e.target.checked}))} />
                  Visa i bildspel (hero)
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={galleryForm.use_in_gallery} onChange={e => setGalleryForm(f => ({...f,use_in_gallery:e.target.checked}))} />
                  Visa i bildgalleri
                </label>
              </div>
              <button onClick={uploadGallery} disabled={!galleryImage} style={{ ...saveBtn, opacity: galleryImage ? 1 : 0.5 }}>
                Ladda upp bild
              </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
              {gallery.map(img => (
                <div key={img.id} style={{ background:'white', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
                  <img src={img.image_path} alt={img.alt_sv||''} style={{ width:'100%', height:120, objectFit:'cover' }} />
                  <div style={{ padding:'8px 10px' }}>
                    <div style={{ fontSize:11, color:'var(--ink-pale)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{img.alt_sv||'(ingen text)'}</div>
                    <div style={{ display:'flex', gap:4, marginBottom:6 }}>
                      <button onClick={() => toggleGalleryImg(img.id,'use_in_hero',img.use_in_hero)} style={{ ...togBtn, background:img.use_in_hero?'#d4edda':'#f8d7da', color:img.use_in_hero?'#155724':'#721c24' }}>
                        {img.use_in_hero?'✓ Hero':'✗ Hero'}
                      </button>
                      <button onClick={() => toggleGalleryImg(img.id,'use_in_gallery',img.use_in_gallery)} style={{ ...togBtn, background:img.use_in_gallery?'#d4edda':'#f8d7da', color:img.use_in_gallery?'#155724':'#721c24' }}>
                        {img.use_in_gallery?'✓ Gall.':'✗ Gall.'}
                      </button>
                    </div>
                    <button onClick={() => deleteGalleryImage(img.id)} style={{ width:'100%', padding:'4px 0', background:'white', border:'1px solid #f5c6cb', color:'var(--red)', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:11 }}>Ta bort</button>
                  </div>
                </div>
              ))}
              {gallery.length === 0 && (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'var(--ink-pale)', fontSize:14 }}>Inga bilder uppladdade än.</div>
              )}
            </div>
          </div>
        )}
      </AdminLayout>
    </>
  );
}

const lbl = { fontSize:11, fontWeight:500, color:'var(--ink-pale)', textTransform:'uppercase', letterSpacing:'0.3px', display:'block', marginBottom:3 };
const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--sand-dark)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' };
const saveBtn = { flex:1, padding:'9px 16px', background:'var(--water)', color:'white', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:13, fontWeight:500 };
const actionBtn = { padding:'4px 10px', border:'1px solid var(--sand-dark)', background:'white', borderRadius:'var(--radius-md)', cursor:'pointer', fontSize:12, color:'var(--ink-light)' };
const togBtn = { padding:'3px 6px', border:'none', borderRadius:20, cursor:'pointer', fontSize:10, fontWeight:500 };
const msgBox = { background:'var(--water-pale)', border:'1px solid var(--water)', borderRadius:'var(--radius-md)', padding:'10px 16px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' };

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
