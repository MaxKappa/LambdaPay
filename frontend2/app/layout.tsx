import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LambdaPay',
  description: 'A modern, serverless payment platform'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
