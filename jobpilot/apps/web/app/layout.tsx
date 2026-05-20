import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'JobPilot AutoApply USA',
  description: 'Automated job application system for US companies',
  manifest: '/manifest.json',
  themeColor: '#3b82f6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`} suppressHydrationWarning>
        <Sidebar />
        <main className="ml-60 min-h-screen bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
