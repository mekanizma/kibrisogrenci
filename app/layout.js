import './globals.css'
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google'
import { Providers } from './providers'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  DEFAULT_TITLE_TEMPLATE,
  OG_DESCRIPTION,
  OG_IMAGE,
  SEO_KEYWORDS,
  SITE_GEO,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  buildSiteJsonLd,
} from '@/lib/seo'

const sans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
  preload: true,
})

const display = Fraunces({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-display',
  preload: false,
})

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: DEFAULT_TITLE_TEMPLATE,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'real estate',
  classification: 'KKTC öğrenci konaklama',
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    email: true,
    address: true,
    telephone: true,
  },
  icons: {
    icon: [{ url: '/logo-icon.png', type: 'image/png' }],
    apple: [{ url: '/logo-icon.png', type: 'image/png' }],
    shortcut: '/logo-icon.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  alternates: {
    canonical: '/',
    languages: {
      'tr-TR': '/',
      tr: '/',
      en: '/',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    alternateLocale: ['en_US', 'en_GB'],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: OG_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE.url,
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        alt: OG_IMAGE.alt,
        type: OG_IMAGE.type,
      },
      {
        url: '/logo.png',
        alt: `${SITE_NAME} logo`,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: OG_DESCRIPTION,
    images: [absoluteUrl(OG_IMAGE.url)],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    'geo.region': SITE_GEO.region,
    'geo.placename': SITE_GEO.placename,
    'geo.position': `${SITE_GEO.latitude};${SITE_GEO.longitude}`,
    ICBM: `${SITE_GEO.latitude}, ${SITE_GEO.longitude}`,
    'og:locale:alternate': 'en_US',
  },
}

const jsonLd = buildSiteJsonLd()

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${sans.variable} ${display.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);',
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
