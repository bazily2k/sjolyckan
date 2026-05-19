const { i18n } = require('./next-i18next.config');
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  i18n,
  images: {
    domains: ['a0.muscache.com'],
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:8000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://backend:8000/uploads/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
