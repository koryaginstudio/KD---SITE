import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { ADMIN_EMAIL } from "../lib/admin-identity";
import { AdminPanel } from "./admin-panel";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Управление проектами - КОРЯГИН ДИЗАЙН™",
  description: "Закрытая панель управления портфолио.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");

  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    return (
      <main className="admin-access-denied">
        <img src="/assets/logos/logo-monogram-bone-plain.svg" alt="" />
        <h1>Доступ закрыт</h1>
        <p>Эта панель доступна только владельцу сайта.</p>
        {/* Keep a full navigation so leaving the protected area clears its state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">Вернуться на сайт</a>
      </main>
    );
  }

  return <AdminPanel userName={user.fullName ?? "Антон"} userEmail={user.email} />;
}
