import { KKTC_CITIES, UNI_CATALOG } from '@/lib/universities';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kibrisogrenci.com').replace(/\/$/, '');
export const SITE_NAME = 'Kıbrıs Öğrenci';
export const SITE_NAME_EN = 'Cyprus Student Housing';
export const SITE_DOMAIN = 'kibrisogrenci.com';
export const SITE_LOCALE = 'tr_TR';
export const SITE_TWITTER = '@kibrisogrenci';

/** Lefkoşa approximate center — geo / local SEO signals */
export const SITE_GEO = {
  placename: 'Kuzey Kıbrıs Türk Cumhuriyeti',
  region: 'CY',
  latitude: 35.1856,
  longitude: 33.3823,
  country: 'KKTC',
};

export const DEFAULT_TITLE = 'Kıbrıs Öğrenci — KKTC Öğrenci Evi, Yurt ve Konaklama';
export const DEFAULT_TITLE_TEMPLATE = '%s | Kıbrıs Öğrenci';

export const DEFAULT_DESCRIPTION =
  'KKTC’de öğrenci evi, yurt ve kampüse yakın kiralık konaklama. Lefkoşa, Gazimağusa, Girne, Güzelyurt, İskele ve Lefke’de doğrulanmış ilanlar; DAÜ, YDÜ, UKÜ, GAU ve diğer üniversitelere yürüme mesafesi.';

export const OG_DESCRIPTION =
  'Kuzey Kıbrıs (KKTC) üniversitelerine yakın, doğrulanmış öğrenci konaklaması. Adil fiyat, kampüse mesafe ve güvenli iletişim — Kıbrıs Öğrenci.';

/** Primary keywords for KKTC student housing search intent */
export const SEO_KEYWORDS = [
  'KKTC öğrenci evi',
  'Kuzey Kıbrıs öğrenci konaklama',
  'KKTC kiralık ev öğrenci',
  'KKTC yurt',
  'Lefkoşa öğrenci evi',
  'Gazimağusa öğrenci evi',
  'Girne öğrenci evi',
  'Güzelyurt öğrenci evi',
  'Lefke öğrenci evi',
  'İskele öğrenci evi',
  'DAÜ öğrenci evi',
  'YDÜ öğrenci evi',
  'UKÜ öğrenci evi',
  'GAU öğrenci evi',
  'ODTÜ KKTC konaklama',
  'kampüse yakın kiralık',
  'Kıbrıs öğrenci evi',
  'TRNC student housing',
  'Northern Cyprus student accommodation',
  ...KKTC_CITIES.map((c) => `${c} öğrenci evi`),
  ...UNI_CATALOG.slice(0, 12).map((u) => `${u.short} konaklama`),
];

export const OG_IMAGE = {
  url: '/hero.jpg',
  width: 1920,
  height: 1080,
  alt: 'KKTC’de kampüse yakın öğrenci konaklaması — Kıbrıs Öğrenci',
  type: 'image/jpeg',
};

export function absoluteUrl(path = '/') {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function organizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: [SITE_NAME_EN, 'Kibris Ogrenci', 'kibrisogrenci'],
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/logo.png'),
      width: 512,
      height: 512,
    },
    image: absoluteUrl(OG_IMAGE.url),
    description: DEFAULT_DESCRIPTION,
    email: 'noreply@kibrisogrenci.com',
    areaServed: [
      {
        '@type': 'Country',
        name: 'Kuzey Kıbrıs Türk Cumhuriyeti',
        alternateName: ['KKTC', 'TRNC', 'Northern Cyprus'],
      },
      ...KKTC_CITIES.map((name) => ({
        '@type': 'City',
        name,
        containedInPlace: { '@type': 'Country', name: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
      })),
    ],
    knowsAbout: [
      'Öğrenci konaklaması',
      'KKTC kiralık ev',
      'Kampüse yakın yurt',
      ...UNI_CATALOG.map((u) => u.name_tr),
    ],
    sameAs: [],
  };
}

function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: ['tr-TR', 'en'],
  };
}

function serviceJsonLd() {
  return {
    '@type': 'Service',
    '@id': `${SITE_URL}/#service`,
    name: 'KKTC Öğrenci Konaklama Platformu',
    serviceType: 'Öğrenci evi ve yurt ilan platformu',
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: KKTC_CITIES.map((name) => ({ '@type': 'City', name })),
    description:
      'Kuzey Kıbrıs üniversite öğrencileri için doğrulanmış kiralık ev, oda ve yurt ilanlarını bir araya getiren konaklama platformu.',
    audience: {
      '@type': 'Audience',
      audienceType: 'Üniversite öğrencileri',
    },
  };
}

function faqJsonLd() {
  return {
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    mainEntity: [
      {
        '@type': 'Question',
        name: 'KKTC’de öğrenci evi nasıl bulurum?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Kıbrıs Öğrenci’de Lefkoşa, Gazimağusa, Girne, Güzelyurt, İskele ve Lefke’deki doğrulanmış öğrenci evi ve yurt ilanlarını üniversiteye göre filtreleyerek güvenle inceleyebilirsiniz.',
        },
      },
      {
        '@type': 'Question',
        name: 'Hangi üniversitelere yakın konaklama var?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Platformda ${UNI_CATALOG.slice(0, 8)
            .map((u) => u.name_tr)
            .join(', ')} ve diğer KKTC üniversitelerine yakın ilanlar listelenir.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Kıbrıs Öğrenci kira veya depozito tahsil eder mi?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Hayır. Kıbrıs Öğrenci hiçbir zaman kira veya depozito tahsil etmez; ödeme yalnızca doğrudan doğrulanmış ilan sahibiyle yapılır.',
        },
      },
      {
        '@type': 'Question',
        name: 'İlanlar güvenli mi?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'İlan sahipleri doğrulama süreçlerinden geçer; şüpheli ilanları bildirebilir, dolandırıcılık rehberimizdeki adımları izleyerek güvenli iletişim kurabilirsiniz.',
        },
      },
    ],
  };
}

function universityItemListJsonLd() {
  return {
    '@type': 'ItemList',
    '@id': `${SITE_URL}/#universities`,
    name: 'KKTC Üniversiteleri — Öğrenci Konaklaması',
    description: 'Kuzey Kıbrıs’taki üniversitelere yakın öğrenci evi ve yurt araması',
    numberOfItems: UNI_CATALOG.length,
    itemListElement: UNI_CATALOG.map((u, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: u.name_tr,
      description: `${u.city} — ${u.name_en} kampüsüne yakın öğrenci konaklaması`,
    })),
  };
}

/** Combined JSON-LD graph for homepage / root layout */
export function buildSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      websiteJsonLd(),
      serviceJsonLd(),
      faqJsonLd(),
      universityItemListJsonLd(),
    ],
  };
}
