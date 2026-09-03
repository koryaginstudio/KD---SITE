import type { Metadata } from "next";
import { Analytics } from "./analytics";
import { localeBootstrapScript } from "./i18n/locale";
import "./globals.css";

const siteUrl = new URL("https://koryagindesign.com");
const pageTitle = "КОРЯГИН ДИЗАЙН™ | Брендинг, айдентика и логотипы";
const socialTitle = "КОРЯГИН ДИЗАЙН™ – Айдентика, брендинг, логотипы";
const socialDescription =
  "Создаю дизайн, который работает на ваш бизнес и помогает завоевывать доверие клиентов и поднимать средний чек. От уличного искусства - к эффективным дизайн-решениям.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  alternates: { canonical: "/" },
  title: {
    default: pageTitle,
    template: "%s | КОРЯГИН ДИЗАЙН™",
  },
  description: socialDescription,
  authors: [{ name: "Антон Корягин", url: "/" }],
  creator: "Антон Корягин",
  publisher: "КОРЯГИН ДИЗАЙН™",
  category: "design",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    alternateLocale: ["en_US"],
    url: "/",
    siteName: "КОРЯГИН ДИЗАЙН™",
    title: socialTitle,
    description: socialDescription,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "КОРЯГИН ДИЗАЙН™",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: ["/og-image.jpg"],
  },
  manifest: "/manifest.webmanifest",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${siteUrl}#person`,
      name: "Антон Корягин",
      alternateName: "Anton Koryagin",
      url: siteUrl.toString(),
      jobTitle: "Бренд-дизайнер",
      sameAs: [
        "https://t.me/koryagindesign",
        "https://instagram.com/koryagindesign",
        "https://behance.net/koryagindesign",
        "https://www.linkedin.com/in/antonkoryagindesign/",
      ],
    },
    {
      "@type": "ProfessionalService",
      "@id": `${siteUrl}#studio`,
      name: "КОРЯГИН ДИЗАЙН™",
      alternateName: "KORYAGIN DESIGN™",
      url: siteUrl.toString(),
      logo: new URL("/assets/logos/logo-wordmark-stacked-ink.svg", siteUrl).toString(),
      image: new URL("/og-image.jpg", siteUrl).toString(),
      founder: { "@id": `${siteUrl}#person` },
      email: "koryaginstudio@gmail.com",
      telephone: "+79650381235",
      areaServed: "Worldwide",
      serviceType: [
        "Брендинг",
        "Айдентика",
        "Дизайн логотипа",
        "Дизайн упаковки",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}#website`,
      url: siteUrl.toString(),
      name: "КОРЯГИН ДИЗАЙН™",
      alternateName: "KORYAGIN DESIGN™",
      publisher: { "@id": `${siteUrl}#studio` },
      inLanguage: ["ru", "en"],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-kd-locale="ru" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          as="image"
          href="/assets/logos/logo-wordmark-stacked-ink.svg"
        />
        <link rel="preload" as="image" href="/assets/logos/eng-logo-horizontal-dark.svg" />
        <link rel="preload" as="image" href="/assets/logos/eng-logo-horizontal-white.svg" />
        <script
          dangerouslySetInnerHTML={{ __html: localeBootstrapScript() }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <link rel="stylesheet" href="/assets/index-DZ3RXAbB.css" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
