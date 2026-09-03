import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Страница не найдена",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "32px",
      background: "#f2f0ed",
      color: "#1f1d1c",
      textAlign: "center",
      fontFamily: "Arial, sans-serif",
    }}>
      <div>
        <p style={{ margin: "0 0 12px", color: "#e62b24", fontWeight: 700 }}>404</p>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(36px, 7vw, 72px)" }}>
          Страница не найдена
        </h1>
        <p style={{ margin: "0 0 28px", color: "#67615d" }}>
          Возможно, ссылка устарела или в адресе есть ошибка.
        </p>
        <Link href="/" style={{ color: "inherit", fontWeight: 700 }}>
          Вернуться на главную
        </Link>
      </div>
    </main>
  );
}
