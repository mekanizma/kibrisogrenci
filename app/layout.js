import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-inter' })

export const metadata = {
  title: 'Kıbrıs Öğrenci — KKTC Öğrenci Konaklaması',
  description:
    'Kuzey Kıbrıs üniversitelerine yakın, doğrulanmış öğrenci konaklaması. Kampüse yürüme mesafesi, adil fiyat karşılaştırması ve doğrulanmış ilan sahipleri.',
  icons: { icon: '/logo.svg', apple: '/logo.png' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
