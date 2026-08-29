import type { Metadata } from "next";
import { localeBootstrapScript } from "./i18n/locale";
import "./globals.css";

const siteUrl = new URL("https://koryagindesign.com");
const pageTitle = "КОРЯГИН ДИЗАЙН™ | Брендинг, айдентика, логотипы";
const socialTitle = "КОРЯГИН ДИЗАЙН™ – Айдентика, брендинг, логотипы";
const socialDescription =
  "Создаю дизайн, который работает на ваш бизнес и помогает завоевывать доверие клиентов и поднимать средний чек. От уличного искусства - к эффективным дизайн-решениям.";

const yandexMetrika = `
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=111869692','ym');

ym(111869692,'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
`;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  alternates: { canonical: "/" },
  title: pageTitle,
  description: socialDescription,
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
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
          type="text/javascript"
          dangerouslySetInnerHTML={{ __html: yandexMetrika }}
        />
        <link rel="stylesheet" href="/assets/index-DZ3RXAbB.css" />
      </head>
      <body>
        <noscript>
          <div>
            <img
              src="https://mc.yandex.ru/watch/111869692"
              style={{ position: "absolute", left: "-9999px" }}
              alt=""
            />
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
