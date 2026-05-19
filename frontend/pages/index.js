import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Nav from '../components/common/Nav';
import BookingSidebar from '../components/booking/BookingSidebar';
import AvailabilityCalendar from '../components/booking/AvailabilityCalendar';
import RoomModal from '../components/common/RoomModal';
import { publicApi } from '../lib/api';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const FALLBACK_IMAGES = [
  'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/f36497a2-2a7d-481c-b2ef-2cc619fe8407.jpeg?im_w=1200',
  'https://a0.muscache.com/im/pictures/miso/Hosting-910083123289876327/original/424d78fc-388e-4e55-8d70-6dba566f9fd3.jpeg?im_w=720',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/10dcfd46-f418-4a75-ba92-5f11911b94ff.jpeg?im_w=720',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/91f1b5fe-dc2c-4250-9973-cf761f2f3773.jpeg?im_w=720',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/2b95eccd-fd17-4f6f-b19c-316556314cb9.jpeg?im_w=720',
];

const FALLBACK_ROOMS = [
  { id:1, name:'Sovrum 1', beds:'1 dubbelsäng', image_path:'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/91f1b5fe-dc2c-4250-9973-cf761f2f3773.jpeg?im_w=720', images:[] },
  { id:2, name:'Sovrum 2', beds:'1 enkelsäng', image_path:'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/2b95eccd-fd17-4f6f-b19c-316556314cb9.jpeg?im_w=720', images:[] },
  { id:3, name:'Sovrum 3', beds:'1 dubbelsäng', image_path:'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/e0c1e851-ed1a-483d-8551-36dcfef75a97.jpeg?im_w=720', images:[] },
  { id:4, name:'Sovrum 4', beds:'1 dubbelsäng', image_path:'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6OTEwMDgzMTIzMjg5ODc2MzI3/original/b7796ba4-ddc7-4392-a272-03ae16b0a8e0.jpeg?im_w=720', images:[] },
];

const AMENITIES = [
  { icon:'🌊', sv:'Sjöutsikt', en:'Lake view', de:'Seeblick' },
  { icon:'🏖️', sv:'Strand & brygga', en:'Beach & dock', de:'Strand & Steg' },
  { icon:'🍳', sv:'Fullt utrustat kök', en:'Fully equipped kitchen', de:'Voll ausgestattete Küche' },
  { icon:'📶', sv:'WiFi', en:'WiFi', de:'WLAN' },
  { icon:'🧺', sv:'Tvättstuga', en:'Laundry room', de:'Waschküche' },
  { icon:'⚓', sv:'Privat brygga', en:'Private dock', de:'Privatsteg' },
  { icon:'🔐', sv:'Smart lås', en:'Smart lock', de:'Smart Lock' },
  { icon:'🌲', sv:'Trädgård', en:'Garden', de:'Garten' },
];

export default function Home({ locale }) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const lang = router.locale || locale || 'sv';
  const bookingRef = useRef(null);

  const [articles, setArticles] = useState([]);
  const [heroImages, setHeroImages] = useState(FALLBACK_IMAGES);
  const [galleryImages, setGalleryImages] = useState([]);
  const [rooms, setRooms] = useState(FALLBACK_ROOMS);
  const [content, setContent] = useState({});
  const [heroImg, setHeroImg] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingDates, setBookingDates] = useState({ checkIn:'', checkOut:'' });

  useEffect(() => {
    Promise.all([
      publicApi.articles(lang),
      axios.get(`${API}/cms/public/hero`).catch(() => ({ data: [] })),
      axios.get(`${API}/cms/public/gallery?lang=${lang}`).catch(() => ({ data: [] })),
      axios.get(`${API}/cms/public/rooms?lang=${lang}`).catch(() => ({ data: [] })),
      axios.get(`${API}/cms/public/content?lang=${lang}`).catch(() => ({ data: {} })),
    ]).then(([arts, hero, gallery, roomsRes, contentRes]) => {
      setArticles(arts.data);
      if (hero.data.length > 0) setHeroImages(hero.data.map(i => i.image_path));
      if (gallery.data.length > 0) setGalleryImages(gallery.data);
      if (roomsRes.data.length > 0) setRooms(roomsRes.data);
      setContent(contentRes.data);
    }).catch(() => {});

    const interval = setInterval(() => setHeroImg(i => (i + 1) % heroImages.length), 5000);
    return () => clearInterval(interval);
  }, [lang]);

  const handleSelectDates = ({ checkIn, checkOut }) => {
    setBookingDates({ checkIn, checkOut });
    bookingRef.current?.scrollIntoView({ behavior:'smooth', block:'center' });
  };

  const displayGallery = galleryImages.length > 0
    ? galleryImages.map(i => i.image_path)
    : FALLBACK_IMAGES;

  const rules = [
    content.checkin_rule || 'Incheckning efter kl. 15:00',
    content.checkout_rule || 'Utcheckning innan kl. 12:00',
    content.max_guests_rule || 'Max 8 gäster',
    content.linen_rule || 'Egna sängkläder medbringas',
    content.pets_rule || 'Inga husdjur i sängar eller soffor',
    content.cleaning_rule || 'Gästen städar vid utcheckning',
  ];

  const clickRoomLabel = lang === 'de' ? 'Mehr Fotos →' : lang === 'en' ? 'More photos →' : 'Fler bilder →';

  return (
    <>
      <Head>
        <title>{content.hero_title || 'Sjölyckan'}, Rolsmo — Semesterstuga vid Rolsmosjön</title>
        <meta name="description" content="Boka Sjölyckan — en fridfull semesterstuga vid Rolsmosjön i Småland." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Nav />

      {/* Hero bildspel */}
      <section style={{ position:'relative', height:'100vh', minHeight:600, overflow:'hidden' }}>
        {heroImages.map((img, i) => (
          <div key={i} style={{
            position:'absolute', inset:0,
            backgroundImage:`url(${img})`,
            backgroundSize:'cover', backgroundPosition:'center',
            transition:'opacity 1.5s ease',
            opacity: i === heroImg % heroImages.length ? 1 : 0,
          }} />
        ))}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.5) 100%)' }} />
        <div style={{ position:'relative', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', color:'white', padding:'0 24px' }}>
          <p style={{ fontSize:14, fontWeight:300, letterSpacing:'3px', textTransform:'uppercase', marginBottom:12, opacity:0.85 }}>
            {content.hero_subtitle || 'Rolsmo, Småland'}
          </p>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(52px, 10vw, 90px)', fontWeight:400, marginBottom:16, letterSpacing:'-2px' }}>
            {content.hero_title || 'Sjölyckan'}
          </h1>
          <p style={{ fontSize:18, fontWeight:300, maxWidth:480, opacity:0.9, marginBottom:36, lineHeight:1.6 }}>
            {content.hero_tagline || 'En sommar att minnas vid Rolsmosjön'}
          </p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
            <a href="#boka" style={{ padding:'14px 36px', background:'white', color:'var(--ink)', borderRadius:'var(--radius-xl)', fontSize:15, fontWeight:500, boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
              {t('hero.cta')} ↓
            </a>
            <a href="#kalender" style={{ padding:'14px 36px', background:'rgba(255,255,255,0.15)', color:'white', borderRadius:'var(--radius-xl)', fontSize:15, fontWeight:400, border:'1px solid rgba(255,255,255,0.4)' }}>
              {lang === 'sv' ? 'Se tillgänglighet' : lang === 'en' ? 'Check availability' : 'Verfügbarkeit prüfen'}
            </a>
          </div>
        </div>
        <div style={{ position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)', display:'flex', gap:6 }}>
          {heroImages.map((_, i) => (
            <button key={i} onClick={() => setHeroImg(i)} style={{ width: i === heroImg % heroImages.length ? 20 : 6, height:6, borderRadius:3, border:'none', background: i === heroImg % heroImages.length ? 'white' : 'rgba(255,255,255,0.5)', cursor:'pointer', transition:'all 0.3s' }} />
          ))}
        </div>
      </section>

      {/* Bildgalleri */}
      {displayGallery.length > 0 && (
        <section style={{ padding:'48px 24px 0', maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gridTemplateRows:'200px 200px', gap:8, borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
            {displayGallery.slice(0,5).map((img, i) => (
              <div key={i} style={{ gridRow: i===0 ? 'span 2' : 'auto', backgroundImage:`url(${img})`, backgroundSize:'cover', backgroundPosition:'center' }} />
            ))}
          </div>
        </section>
      )}

      {/* Tillgänglighetskalender */}
      <section id="kalender" style={{ padding:'56px 24px 0', maxWidth:1100, margin:'0 auto' }}>
        <AvailabilityCalendar lang={lang} onSelectDates={handleSelectDates} />
      </section>

      {/* Huvud-sektion */}
      <section id="boka" style={{ padding:'56px 24px', maxWidth:1100, margin:'0 auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 340px', gap:48 }}>
          <div>
            {/* Om */}
            <div style={{ borderBottom:'1px solid var(--sand-dark)', paddingBottom:24, marginBottom:24 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:28, marginBottom:8 }}>
                {content.about_title || 'Om Sjölyckan'}
              </h2>
              <p style={{ fontSize:14, color:'var(--ink-pale)', marginBottom:12 }}>
                {content.capacity || '8 gäster · 4 sovrum · 4 sängar · 1,5 badrum'}
              </p>
              <p style={{ fontSize:15, color:'var(--ink-light)', lineHeight:1.8, maxWidth:560 }}>
                {content.about_text || ''}
              </p>
            </div>

            {/* Bekvämligheter */}
            <div style={{ borderBottom:'1px solid var(--sand-dark)', paddingBottom:24, marginBottom:24 }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, marginBottom:16 }}>
                {content.amenities_title || 'Bekvämligheter'}
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {AMENITIES.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, color:'var(--ink-light)' }}>
                    <span style={{ fontSize:20 }}>{a.icon}</span>{a[lang]||a.sv}
                  </div>
                ))}
              </div>
            </div>

            {/* Rum — klickbara */}
            <div style={{ borderBottom:'1px solid var(--sand-dark)', paddingBottom:24, marginBottom:24 }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, marginBottom:16 }}>
                {content.sleep_title || 'Var du sover'}
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {rooms.map(r => (
                  <div key={r.id} onClick={() => setSelectedRoom(r)}
                    style={{ borderRadius:'var(--radius-md)', overflow:'hidden', border:'1px solid var(--sand-dark)', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='var(--shadow-md)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
                    <div style={{ position:'relative', height:130 }}>
                      {r.image_path ? (
                        <div style={{ height:'100%', backgroundImage:`url(${r.image_path})`, backgroundSize:'cover', backgroundPosition:'center' }} />
                      ) : (
                        <div style={{ height:'100%', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>🛏</div>
                      )}
                      {r.images?.length > 0 && (
                        <div style={{ position:'absolute', bottom:6, right:6, background:'rgba(0,0,0,0.55)', color:'white', fontSize:11, padding:'3px 8px', borderRadius:20 }}>
                          +{r.images.length} {lang==='sv'?'bilder':lang==='en'?'photos':'Fotos'}
                        </div>
                      )}
                    </div>
                    <div style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{r.name}</div>
                        <div style={{ fontSize:12, color:'var(--ink-pale)' }}>{r.beds}</div>
                      </div>
                      <span style={{ fontSize:12, color:'var(--water)' }}>{clickRoomLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Husregler */}
            <div>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, marginBottom:16 }}>
                {content.rules_title || 'Husregler'}
              </h3>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {rules.map((r, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:14, color:'var(--ink-light)' }}>
                    <span style={{ color:'var(--water)', fontSize:16, marginTop:1 }}>✓</span>{r}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Boknings-sidebar */}
          <div ref={bookingRef} style={{ position:'sticky', top:80, alignSelf:'start' }}>
            {/* Kalender på mobil — visas ovanför bokningsrutan */}
            <div className="mobile-calendar">
              <AvailabilityCalendar lang={lang} onSelectDates={handleSelectDates} />
            </div>
            <BookingSidebar articles={articles} initialCheckIn={bookingDates.checkIn} initialCheckOut={bookingDates.checkOut} />
          </div>
        </div>
      </section>

      <footer style={{ background:'var(--ink)', color:'rgba(255,255,255,0.6)', padding:'32px 24px', textAlign:'center', marginTop:64 }}>
        <p style={{ fontFamily:'var(--font-display)', fontSize:18, color:'white', marginBottom:8 }}>
          {content.hero_title || 'Sjölyckan'}, Rolsmo
        </p>
        <p style={{ fontSize:13 }}>Linneryd, Kronobergs län · rolsmo23.36297@gmail.com</p>
      </footer>

      {/* Rum-modal */}
      {selectedRoom && (
        <RoomModal room={selectedRoom} lang={lang} onClose={() => setSelectedRoom(null)} />
      )}
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return {
    props: {
      locale: locale || 'sv',
      ...(await serverSideTranslations(locale || 'sv', ['common'])),
    },
  };
}
