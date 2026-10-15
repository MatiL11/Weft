import type { Metadata } from 'next'
import { Fraunces, Instrument_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })
const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Weft', template: '%s · Weft' },
  description: 'Record your screen and camera, share a link instantly.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
