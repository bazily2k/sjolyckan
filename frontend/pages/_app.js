import '../styles/globals.css';
import { useEffect } from 'react';
import Head from 'next/head';
import { appWithTranslation } from 'next-i18next';
import { AuthProvider } from '../lib/auth';
import { reportClientError } from '../lib/errorReporting';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Fångar ofångade JS-fel och avvisade promises var som helst på sajten,
    // så vi kan se om en gäst stötte på ett fel som aldrig visades tydligt
    // för dem (t.ex. ett fel mitt i bokningsflödet på den tyska sidan).
    const onError = (event) => {
      reportClientError({ context: 'uncaught-js-error', error: event.error || event.message });
    };
    const onRejection = (event) => {
      reportClientError({ context: 'unhandled-rejection', error: event.reason });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <AuthProvider>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default appWithTranslation(MyApp);
