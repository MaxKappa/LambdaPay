import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from "@/components/ui/toaster"
import { AmplifyProvider } from "@/components/amplify-provider"

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
      <body>
        <AmplifyProvider>
          {children}
          <Toaster />
        </AmplifyProvider>
      </body>
    </html>
  )
}
