"use client";

import { useEffect } from "react";

const CONSENT_KEY = "kd-cookie-consent";
const YANDEX_ID = 111869692;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
  }
}

export function Analytics() {
  useEffect(() => {
    let active = true;
    let started = false;

    const hasConsent = () => {
      try {
        return window.localStorage.getItem(CONSENT_KEY) === "accepted";
      } catch {
        return false;
      }
    };

    const loadScript = (id: string, src: string) => {
      if (document.getElementById(id)) return;
      const script = document.createElement("script");
      script.id = id;
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    };

    const start = async () => {
      if (started || !active || !hasConsent()) return;
      started = true;

      window.ym ??= (...args: unknown[]) => {
        const queue = window.ym as typeof window.ym & { a?: unknown[][]; l?: number };
        (queue.a ??= []).push(args);
      };
      Object.assign(window.ym, { l: Date.now() });
      loadScript("kd-yandex-metrika", `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_ID}`);
      window.ym(YANDEX_ID, "init", {
        ssr: true,
        webvisor: true,
        clickmap: true,
        referrer: document.referrer,
        url: window.location.href,
        accurateTrackBounce: true,
        trackLinks: true,
      });

      try {
        const response = await fetch("/api/analytics-config", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || !active || !hasConsent()) return;
        const config = await response.json() as { googleAnalyticsId?: string };
        const measurementId = config.googleAnalyticsId?.trim();
        if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return;

        window.dataLayer ??= [];
        window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
        window.gtag("js", new Date());
        window.gtag("config", measurementId, {
          anonymize_ip: true,
          send_page_view: true,
        });
        loadScript(
          "kd-google-analytics",
          `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
        );
      } catch (error) {
        console.error("Google Analytics is unavailable", error);
      }
    };

    const onConsent = () => void start();
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) void start();
    };
    window.addEventListener("kd-cookie-consent-changed", onConsent);
    window.addEventListener("storage", onStorage);
    void start();

    return () => {
      active = false;
      window.removeEventListener("kd-cookie-consent-changed", onConsent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const trackConversion = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; source?: string }>).detail;
      const parameters = {
        lead_type: detail?.kind ?? "lead",
        lead_source: detail?.source ?? "website",
      };
      window.gtag?.("event", "generate_lead", parameters);
      window.ym?.(YANDEX_ID, "reachGoal", "generate_lead", parameters);
    };

    const trackContact = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const href = link.href;
      const channel = href.includes("t.me/")
        ? "telegram"
        : href.startsWith("mailto:")
          ? "email"
          : href.startsWith("tel:")
            ? "phone"
            : href.includes("behance.net")
              ? "behance"
              : href.includes("linkedin.com")
                ? "linkedin"
                : "";
      if (!channel) return;
      window.gtag?.("event", "contact_click", { contact_channel: channel });
      window.ym?.(YANDEX_ID, "reachGoal", "contact_click", { channel });
    };

    window.addEventListener("kd:conversion", trackConversion);
    document.addEventListener("click", trackContact);
    return () => {
      window.removeEventListener("kd:conversion", trackConversion);
      document.removeEventListener("click", trackContact);
    };
  }, []);

  return null;
}
