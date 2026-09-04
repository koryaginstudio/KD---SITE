"use client";

import { useEffect } from "react";
import { installLegacySubmissionBridge } from "./legacy-submission-bridge";

const LEGACY_ENTRY = "/assets/index-xadm5lxP.js?v=20260902-2";
const LOAD_TIMEOUT_MS = 25000;
let webGLPreflightDone = false;

function enableReducedMotionFallbackWhenWebGLIsUnavailable() {
  if (webGLPreflightDone) return;
  webGLPreflightDone = true;

  const canvas = document.createElement("canvas");
  let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    context =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
  } catch {
    context = null;
  }

  if (context) {
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return;
  }

  const originalMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = ((query: string) => {
    const mediaQuery = originalMatchMedia(query);
    if (query !== "(prefers-reduced-motion: reduce)") return mediaQuery;

    return new Proxy(mediaQuery, {
      get(target, property) {
        if (property === "matches") return true;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof window.matchMedia;
}

export function LegacyBoot() {
  useEffect(() => {
    const root = document.getElementById("root");
    const loader = document.getElementById("kd-site-loader");
    const indicator = loader?.querySelector<HTMLElement>(
      "[data-loader-indicator]",
    );
    const retry = loader?.querySelector<HTMLButtonElement>("[data-loader-retry]");
    if (!root || !loader || !indicator || !retry) return;

    let readyTimer: ReturnType<typeof window.setTimeout> | undefined;

    const hasRenderedRoute = () => {
      const localeReady =
        document.documentElement.dataset.kdLocale !== "en" ||
        document.documentElement.classList.contains("kd-locale-ready");
      return localeReady && Boolean(root.querySelector("main, .kd-portfolio-grid"));
    };

    const showLoader = (failed = false) => {
      loader.classList.remove("is-hidden");
      loader.classList.toggle("has-error", failed);
      indicator.hidden = failed;
      retry.hidden = !failed;
    };

    const hideLoader = () => {
      loader.classList.add("is-hidden");
      loader.classList.remove("has-error");
      retry.hidden = true;
      if (loadTimer) window.clearTimeout(loadTimer);
    };

    const syncLoader = () => {
      if (hasRenderedRoute()) {
        hideLoader();
        if (readyTimer) window.clearTimeout(readyTimer);
        readyTimer = window.setTimeout(() => {
          try {
            sessionStorage.removeItem("kd-site-load-failed");
          } catch {
            // Session storage is optional in private browsing modes.
          }
        }, 3000);
        return;
      }

      showLoader(false);
    };

    const markFailed = () => {
      if (hasRenderedRoute()) return;
      showLoader(true);
      try {
        sessionStorage.setItem("kd-site-load-failed", "1");
      } catch {
        // The retry button still works without session storage.
      }
    };

    const handleRetry = () => window.location.reload();
    retry.addEventListener("click", handleRetry);
    window.addEventListener("kd-locale-ready", syncLoader);

    enableReducedMotionFallbackWhenWebGLIsUnavailable();
    const restoreSubmissionBridge = installLegacySubmissionBridge();

    const observer = new MutationObserver(syncLoader);
    observer.observe(root, { childList: true, subtree: true });

    let script = document.querySelector<HTMLScriptElement>(
      'script[data-kd-legacy-entry="true"]',
    );
    const shouldAppendScript = !script;
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = LEGACY_ENTRY;
      script.dataset.kdLegacyEntry = "true";
    }
    script.addEventListener("load", syncLoader);
    if (shouldAppendScript) document.head.appendChild(script);

    const loadTimer = window.setTimeout(markFailed, LOAD_TIMEOUT_MS);
    syncLoader();

    return () => {
      observer.disconnect();
      if (readyTimer) window.clearTimeout(readyTimer);
      if (loadTimer) window.clearTimeout(loadTimer);
      retry.removeEventListener("click", handleRetry);
      window.removeEventListener("kd-locale-ready", syncLoader);
      script.removeEventListener("load", syncLoader);
      restoreSubmissionBridge();
    };
  }, []);

  return (
    <>
      <div id="root" />
      <div id="kd-site-loader" role="status" aria-label="Загрузка сайта">
        <div className="kd-site-loader__mark">
          <img
            className="kd-site-loader__logo-ru"
            src="/assets/logos/logo-wordmark-stacked-ink.svg"
            alt="КОРЯГИН ДИЗАЙН™"
          />
          <img
            className="kd-site-loader__logo-en"
            src="/assets/logos/eng-logo-horizontal-dark.svg"
            alt="KORYAGIN DESIGN™"
          />
          <span data-loader-indicator aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <button type="button" data-loader-retry hidden>
          Повторить загрузку
        </button>
      </div>
    </>
  );
}
