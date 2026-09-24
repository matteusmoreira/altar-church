import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { PwaInstallProvider } from "@/components/pwa-install"
import { JsonLd } from "@/components/seo/json-ld"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://altarchurch.com.br"),
  title: {
    default: "Altar Church - Gestão Inteligente para Igrejas",
    template: "%s - Altar Church",
  },
  description:
    "Sistema completo de gestão para igrejas. Gerencie membros, células, eventos, finanças, voluntários e Altar Kids em uma plataforma moderna.",
  applicationName: "Altar Church",
  keywords: [
    "gestão para igrejas",
    "sistema para igrejas",
    "app para igreja",
    "células e gceus",
    "financeiro para igreja",
    "altar kids",
    "escalas de voluntários",
    "presença qr code",
  ],
  authors: [{ name: "Altar Church", url: "https://altarchurch.com.br" }],
  creator: "Altar Church",
  publisher: "Altar Church",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Altar Church - Gestão Inteligente para Igrejas",
    description:
      "Sistema completo de gestão para igrejas. Gerencie membros, células, eventos, finanças e voluntários.",
    url: "https://altarchurch.com.br",
    siteName: "Altar Church",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/icons/logo.png",
        width: 1200,
        height: 630,
        alt: "Altar Church - Gestão Inteligente para Igrejas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Altar Church - Gestão Inteligente para Igrejas",
    description:
      "Sistema completo de gestão para igrejas. Gerencie membros, células, eventos, finanças e voluntários.",
    images: ["/icons/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Altar Church",
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  themeColor: "#091426",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <JsonLd />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <PwaInstallProvider>{children}</PwaInstallProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}

