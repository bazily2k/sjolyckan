import '../styles/globals.css';
import { appWithTranslation } from 'next-i18next';
import { AuthProvider } from '../lib/auth';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default appWithTranslation(MyApp);
