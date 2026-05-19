import { useState } from 'react';

export default function RoomModal({ room, onClose, lang = 'sv' }) {
  const [activeImg, setActiveImg] = useState(0);

  // Samla alla bilder — huvudbild + extra
  const allImages = [];
  if (room.image_path) allImages.push({ image_path: room.image_path, caption: room.name });
  if (room.images) allImages.push(...room.images);

  const labels = {
    sv: { close:'Stäng', beds:'Sängar', noImages:'Inga bilder tillagda' },
    en: { close:'Close', beds:'Beds', noImages:'No images added' },
    de: { close:'Schließen', beds:'Betten', noImages:'Keine Bilder vorhanden' },
  };
  const L = labels[lang] || labels.sv;

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'white', borderRadius:'var(--radius-xl)', maxWidth:720, width:'100%', maxHeight:'90vh', overflowY:'auto', position:'relative' }}>
        {/* Stäng-knapp */}
        <button onClick={onClose} style={{
          position:'absolute', top:16, right:16, zIndex:10,
          width:36, height:36, borderRadius:'50%', border:'none',
          background:'rgba(0,0,0,0.5)', color:'white',
          cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center',
        }}>×</button>

        {/* Huvudbild */}
        {allImages.length > 0 ? (
          <div style={{ position:'relative', height:340, background:'var(--sand)' }}>
            <div style={{
              height:'100%',
              backgroundImage:`url(${allImages[activeImg]?.image_path})`,
              backgroundSize:'cover', backgroundPosition:'center',
              borderRadius:'var(--radius-xl) var(--radius-xl) 0 0',
            }} />
            {/* Piltangenter */}
            {allImages.length > 1 && (
              <>
                <button onClick={() => setActiveImg(i => (i - 1 + allImages.length) % allImages.length)} style={arrowBtn('left')}>‹</button>
                <button onClick={() => setActiveImg(i => (i + 1) % allImages.length)} style={arrowBtn('right')}>›</button>
                <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', display:'flex', gap:6 }}>
                  {allImages.map((_, i) => (
                    <button key={i} onClick={() => setActiveImg(i)} style={{
                      width: i === activeImg ? 20 : 6, height:6, borderRadius:3, border:'none',
                      background: i === activeImg ? 'white' : 'rgba(255,255,255,0.5)',
                      cursor:'pointer', transition:'all 0.2s',
                    }} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ height:200, background:'var(--sand)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:48 }}>🛏</div>
        )}

        {/* Thumbnails */}
        {allImages.length > 1 && (
          <div style={{ display:'flex', gap:6, padding:'10px 16px', overflowX:'auto' }}>
            {allImages.map((img, i) => (
              <div key={i} onClick={() => setActiveImg(i)} style={{
                width:64, height:48, flexShrink:0,
                backgroundImage:`url(${img.image_path})`,
                backgroundSize:'cover', backgroundPosition:'center',
                borderRadius:'var(--radius-md)',
                border: i === activeImg ? '2px solid var(--water)' : '2px solid transparent',
                cursor:'pointer', opacity: i === activeImg ? 1 : 0.7,
              }} />
            ))}
          </div>
        )}

        {/* Info */}
        <div style={{ padding:'16px 24px 24px' }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:24, marginBottom:4 }}>{room.name}</h2>
          {room.beds && (
            <p style={{ fontSize:14, color:'var(--ink-pale)', marginBottom:12 }}>
              🛏 {room.beds}
            </p>
          )}
          {room.desc && (
            <p style={{ fontSize:15, color:'var(--ink-light)', lineHeight:1.7 }}>{room.desc}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const arrowBtn = (side) => ({
  position:'absolute', top:'50%', transform:'translateY(-50%)',
  [side]: 12,
  width:36, height:36, borderRadius:'50%', border:'none',
  background:'rgba(0,0,0,0.4)', color:'white',
  cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center',
  zIndex:5,
});
