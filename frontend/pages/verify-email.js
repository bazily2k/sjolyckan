import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const TEXT = {
  sv: {
    verifying: 'Bekräftar din e-postadress …',
    success_title: 'E-postadressen är bekräftad!',
    success_body: 'Tack! Din bokningsförfrågan är nu inskickad. Vi återkommer med en bekräftelse så snart vi granskat den.',
    already_title: 'Redan bekräftad',
    already_body: 'Den här bokningen är redan bekräftad — du behöver inte göra något mer.',
    expired_title: 'Länken har gått ut',
    expired_body: 'Verifieringslänken var giltig i 48 timmar. Gör gärna en ny bokning så skickar vi en ny länk.',
    invalid_title: 'Ogiltig länk',
    invalid_body: 'Länken kunde inte hittas. Kontrollera att du klickade på hela länken i mejlet.',
    error_title: 'Något gick fel',
    error_body: 'Vi kunde inte bekräfta din e-postadress just nu. Försök igen om en stund.',
    ref: 'Bokningsreferens', home: 'Till startsidan',
  },
  en: {
    verifying: 'Confirming your email address …',
    success_title: 'Your email is confirmed!',
    success_body: 'Thank you! Your booking request has been submitted. We\'ll get back to you with a confirmation shortly.',
    already_title: 'Already confirmed',
    already_body: 'This booking is already confirmed — nothing more to do.',
    expired_title: 'The link has expired',
    expired_body: 'The verification link was valid for 48 hours. Please make a new booking and we\'ll send a fresh link.',
    invalid_title: 'Invalid link',
    invalid_body: 'The link could not be found. Please check that you clicked the full link in the email.',
    error_title: 'Something went wrong',
    error_body: 'We couldn\'t confirm your email right now. Please try again shortly.',
    ref: 'Booking reference', home: 'To the homepage',
  },
  de: {
    verifying: 'E-Mail-Adresse wird bestätigt …',
    success_title: 'Ihre E-Mail-Adresse ist bestätigt!',
    success_body: 'Vielen Dank! Ihre Buchungsanfrage wurde eingereicht. Wir melden uns in Kürze mit einer Bestätigung.',
    already_title: 'Bereits bestätigt',
    already_body: 'Diese Buchung ist bereits bestätigt — Sie müssen nichts weiter tun.',
    expired_title: 'Der Link ist abgelaufen',
    expired_body: 'Der Bestätigungslink war 48 Stunden gültig. Bitte erstellen Sie eine neue Buchung für einen neuen Link.',
    invalid_title: 'Ungültiger Link',
    invalid_body: 'Der Link wurde nicht gefunden. Bitte prüfen Sie, ob Sie den vollständigen Link angeklickt haben.',
    error_title: 'Etwas ist schiefgelaufen',
    error_body: 'Wir konnten Ihre E-Mail-Adresse gerade nicht bestätigen. Bitte versuchen Sie es später erneut.',
    ref: 'Buchungsreferenz', home: 'Zur Startseite',
  },
};

const TONE = {
  verifying: { bg: 'var(--sand)',       border: 'var(--sand-dark)' },
  success:   { bg: 'var(--water-pale)', border: 'var(--water)' },
  already:   { bg: 'var(--water-pale)', border: 'var(--water)' },
  expired:   { bg: '#fff4e5',           border: '#e0a94f' },
  invalid:   { bg: '#fdecea',           border: 'var(--red)' },
  error:     { bg: '#fdecea',           border: 'var(--red)' },
};

export default function VerifyEmail() {
  const router = useRouter();
  const lang = router.locale || 'sv';
  const T = TEXT[lang] || TEXT.sv;
  const [status, setStatus] = useState('verifying');
  const [bookingRef, setBookingRef] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.token;
    if (!token) { setStatus('invalid'); return; }
    axios.get(`${API}/bookings/verify-email`, { params: { token } })
      .then(res => {
        const d = res.data || {};
        setBookingRef(d.booking_ref || null);
        setStatus(d.already_verified ? 'already' : 'success');
      })
      .catch(err => {
        const code = err?.response?.status;
        if (code === 404) setStatus('invalid');
        else if (code === 400) setStatus('expired');
        else setStatus('error');
      });
  }, [router.isReady, router.query.token]);

  const homeHref = lang !== 'sv' ? `/${lang}` : '/';
  const tone = TONE[status] || TONE.verifying;
  const title = status === 'verifying' ? '' : T[`${status}_title`];
  const body = status === 'verifying' ? T.verifying : T[`${status}_body`];
  const showRef = status === 'success' && bookingRef;

  return (
    <div style={{ minHeight:'100vh', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'white', borderRadius:'var(--radius-lg)', padding:32, width:'100%', maxWidth:460, boxShadow:'var(--shadow-md)', textAlign:'center' }}>
        {title && <h1 style={{ fontFamily:'var(--font-display)', fontSize:24, marginBottom:12 }}>{title}</h1>}
        <div style={{ background:tone.bg, border:`1px solid ${tone.border}`, borderRadius:'var(--radius-md)', padding:'16px 18px', fontSize:15, color:'var(--ink)', lineHeight:1.5 }}>
          {body}
          {showRef && (
            <div style={{ marginTop:12, fontFamily:'var(--font-display)', fontSize:18 }}>
              {T.ref}: <strong>{bookingRef}</strong>
            </div>
          )}
        </div>
        {status !== 'verifying' && (
          <p style={{ marginTop:20, fontSize:14 }}>
            <a href={homeHref} style={{ color:'var(--water)' }}>{T.home}</a>
          </p>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale || 'sv', ['common'])) } };
}
