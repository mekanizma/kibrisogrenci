const fs = require('fs');
const path = require('path');

const unis = [
  { slug: 'dogu-akdeniz-universitesi', mark: 'DAÜ', color: '#1e3a8a', accent: '#f59e0b' },
  { slug: 'yakin-dogu-universitesi', mark: 'YDÜ', color: '#7f1d1d', accent: '#eab308' },
  { slug: 'uluslararasi-kibris-universitesi', mark: 'UKÜ', color: '#c2410c', accent: '#1e3a8a' },
  { slug: 'girne-amerikan-universitesi', mark: 'GAÜ', color: '#9f1239', accent: '#1e3a5f' },
  { slug: 'girne-universitesi', mark: 'GÜ', color: '#0e4d8c', accent: '#d4a017' },
  { slug: 'final-international-university', mark: 'FIU', color: '#075985', accent: '#38bdf8' },
  { slug: 'odtu-kuzey-kibris', mark: 'ODTÜ', color: '#9b1b2e', accent: '#ffffff' },
  { slug: 'avrupa-universitesi-lefke', mark: 'AÜL', color: '#1d4ed8', accent: '#fbbf24' },
  { slug: 'bahcesehir-kibris-universitesi', mark: 'BAU', color: '#be123c', accent: '#0f172a' },
  { slug: 'rauf-denktas-universitesi', mark: 'RDÜ', color: '#166534', accent: '#eab308' },
  { slug: 'kibris-saglik-ve-toplum-bilimleri-universitesi', mark: 'KSTÜ', color: '#0f766e', accent: '#99f6e4' },
  { slug: 'ada-kent-universitesi', mark: 'AKÜ', color: '#1d4ed8', accent: '#93c5fd' },
  { slug: 'kibris-ilim-universitesi', mark: 'KİÜ', color: '#1e40af', accent: '#f59e0b' },
  { slug: 'arkin-yaratici-sanatlar-ve-tasarim-universitesi', mark: 'ARU', color: '#111827', accent: '#d4a017' },
  { slug: 'kibris-bati-universitesi', mark: 'KBÜ', color: '#0369a1', accent: '#7dd3fc' },
  { slug: 'kibris-amerikan-universitesi', mark: 'KAÜ', color: '#b91c1c', accent: '#1e3a8a' },
];

function svgFor({ mark, color, accent }) {
  const fsSize = mark.length > 3 ? 15 : mark.length > 2 ? 18 : 22;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <linearGradient id="g" x1="20" y1="8" x2="64" y2="72" gradientUnits="userSpaceOnUse">
      <stop stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${color}"/>
    </linearGradient>
  </defs>
  <circle cx="40" cy="40" r="38" fill="#fff"/>
  <circle cx="40" cy="40" r="36" fill="${color}"/>
  <circle cx="40" cy="40" r="29" fill="none" stroke="${accent}" stroke-width="1.6" opacity="0.85"/>
  <path d="M40 14 L44 22 L40 20 L36 22 Z" fill="${accent}"/>
  <text x="40" y="46" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fsSize}" font-weight="700" fill="#fff">${mark}</text>
</svg>
`;
}

const dir = path.join('public', 'unis');
fs.mkdirSync(dir, { recursive: true });
for (const u of unis) {
  fs.writeFileSync(path.join(dir, `${u.slug}.svg`), svgFor(u));
}
console.log('wrote', unis.length, 'svg logos');
