import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyShell } from "../legacy-shell";

type RouteProps = {
  params: Promise<{ slug: string[] }>;
};

const legalPages: Record<string, string> = {
  privacy: "Политика конфиденциальности",
  "personal-data": "Согласие на обработку персональных данных",
  "user-agreement": "Пользовательское соглашение",
  offer: "Публичная оферта",
  "cookies-policy": "Политика использования cookies",
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const path = (await params).slug.join("/");
  if (path === "portfolio") {
    return {
      title: "Портфолио бренд-дизайнера Антона Корягина",
      description:
        "Избранные проекты КОРЯГИН ДИЗАЙН™: брендинг, визуальная айдентика, логотипы, упаковка и цифровой дизайн.",
      alternates: { canonical: "/portfolio" },
      openGraph: { url: "/portfolio" },
    };
  }

  const legalTitle = legalPages[path];
  if (legalTitle) {
    return {
      title: legalTitle,
      description: `${legalTitle}. Официальный документ сайта КОРЯГИН ДИЗАЙН™.`,
      alternates: { canonical: `/${path}` },
      robots: { index: false, follow: true, archive: false },
    };
  }

  return { robots: { index: false, follow: false } };
}

export default async function LegacyRoute({ params }: RouteProps) {
  const path = (await params).slug.join("/");
  if (path !== "portfolio" && !legalPages[path]) notFound();
  return <LegacyShell />;
}
