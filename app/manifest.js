import { DEFAULT_DESCRIPTION, SITE_NAME } from '@/lib/seo';

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: 'Kıbrıs Öğrenci',
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0a3d54',
    lang: 'tr',
    dir: 'ltr',
    categories: ['lifestyle', 'education', 'business'],
    icons: [
      {
        src: '/logo-icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };
}
