import './globals.css'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'

const sans = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-sans' })

export const metadata = {
  title: 'Kıbrıs Öğrenci — KKTC Öğrenci Konaklaması',
  description:
    'Kuzey Kıbrıs üniversitelerine yakın, doğrulanmış öğrenci konaklaması. Kampüse yürüme mesafesi, adil fiyat karşılaştırması ve doğrulanmış ilan sahipleri.',
  icons: { icon: '/logo.svg', apple: '/logo.png' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={sans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
