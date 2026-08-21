import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

// Skickar en felrapport till servern så admin kan se att/vad som gick fel på
// bokningssidorna, även när gästen själv inte kan beskriva felet.
// Fire-and-forget: får ALDRIG kasta eller störa gästens upplevelse.
export function reportClientError({ context, error, extra, guest_email, lang }) {
  try {
    const message = error?.message || (typeof error === 'string' ? error : 'Okänt fel');
    const stack = error?.stack ? String(error.stack).slice(0, 4000) : undefined;
    const payload = {
      context: context || 'unknown',
      message: String(message).slice(0, 4000),
      stack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      lang: lang || undefined,
      guest_email: guest_email || undefined,
      extra: extra && typeof extra === 'object' ? extra : undefined,
    };
    axios.post(`${API}/public/client-error`, payload).catch(() => {});
  } catch (e) {
    // Felrapportering får aldrig i sig orsaka ett nytt fel för gästen.
  }
}
