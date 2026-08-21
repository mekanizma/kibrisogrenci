import './globals.css'
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google'
import { Providers } from './providers'

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
  title: 'Kıbrıs Öğrenci — KKTC Öğrenci Konaklaması',
  description:
    'Kuzey Kıbrıs üniversitelerine yakın, doğrulanmış öğrenci konaklaması. Kampüse yürüme mesafesi, adil fiyat karşılaştırması ve doğrulanmış ilan sahipleri.',
  icons: { icon: '/logo-icon.png', apple: '/logo-icon.png' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${sans.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
