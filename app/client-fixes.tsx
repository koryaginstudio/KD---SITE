"use client";

import { useEffect } from "react";
import {
  currentLocale,
  installEnglishLocalization,
  selectLocale,
} from "./i18n/client-runtime";
import { COUNTRY_COOKIE } from "./i18n/locale";

export function ClientFixes() {
  useEffect(() => installEnglishLocalization(), []);

  useEffect(() => {
    const isAppleDevice = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(
      navigator.userAgent,
    );
    document.documentElement.classList.toggle("kd-apple-device", isAppleDevice);
    return () => document.documentElement.classList.remove("kd-apple-device");
  }, []);

  useEffect(() => {
    const cache = new Map<string, Set<string>>();
    let activeDate = "";
    let requestNumber = 0;

    const localDateKey = (date: Date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

    const selectedDateKey = () => {
      const days = Array.from(document.querySelectorAll<HTMLButtonElement>(".kd-booking-day"));
      const selectedIndex = days.findIndex((day) => day.dataset.selected === "true");
      if (selectedIndex < 0) return "";
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + selectedIndex);
      return localDateKey(date);
    };

    const slotTime = (slot: HTMLButtonElement) =>
      slot.querySelector("span")?.textContent?.trim() || slot.textContent?.trim().slice(0, 5) || "";

    const applyUnavailable = (date: string, unavailable?: Set<string>) => {
      if (date !== selectedDateKey()) return;
      document.querySelectorAll<HTMLButtonElement>(".kd-booking-slot").forEach((slot) => {
        const time = slotTime(slot);
        const insideMinimumNotice = Date.parse(`${date}T${time}:00+03:00`) - Date.now() < 4 * 60 * 60_000;
        const blocked = insideMinimumNotice || (unavailable ? unavailable.has(time) : true);
        slot.disabled = blocked;
        slot.dataset.kdCalendarUnavailable = blocked ? "true" : "false";
        slot.setAttribute(
          "aria-label",
          blocked
            ? `${time} - ${currentLocale() === "en" ? "unavailable" : "занято"}`
            : time,
        );
      });
    };

    const syncAvailability = async () => {
      const date = selectedDateKey();
      if (!date || !document.querySelector(".kd-booking-slot")) return;
      if (date === activeDate) {
        if (cache.has(date)) applyUnavailable(date, cache.get(date));
        return;
      }
      activeDate = date;
      const currentRequest = ++requestNumber;
      applyUnavailable(date);
      try {
        const response = await fetch(`/api/booking-availability?date=${encodeURIComponent(date)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Availability HTTP ${response.status}`);
        const result = await response.json() as { unavailable?: string[] };
        const unavailable = new Set(result.unavailable ?? []);
        cache.set(date, unavailable);
        if (currentRequest === requestNumber) applyUnavailable(date, unavailable);
      } catch (error) {
        console.error("Не удалось проверить Google Calendar", error);
        if (currentRequest === requestNumber) {
          activeDate = "";
          applyUnavailable(date);
        }
      }
    };

    const observer = new MutationObserver(() => void syncAvailability());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-selected"],
    });
    void syncAvailability();
    return () => {
      requestNumber += 1;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const readCookie = (name: string) => {
      const prefix = `${name}=`;
      return document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix))
        ?.slice(prefix.length) ?? "";
    };
    const usTime = currentLocale() === "en" && readCookie(COUNTRY_COOKIE) === "US";

    const toAmPm = (time: string) => {
      const [hours, minutes] = time.split(":").map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
      const suffix = hours >= 12 ? "PM" : "AM";
      const normalized = hours % 12 || 12;
      return `${normalized}:${String(minutes).padStart(2, "0")} ${suffix}`;
    };

    const enhanceInterface = () => {
      document.querySelectorAll<HTMLElement>(".kd-review-card__flag").forEach((badge) => {
        const country = badge.textContent?.trim() ?? "";
        const code = /Россия|Russia/i.test(country)
          ? "ru"
          : /США|United States|USA/i.test(country)
            ? "us"
            : /Норвегия|Norway/i.test(country)
              ? "no"
              : /Великобритания|United Kingdom|UK/i.test(country)
                ? "gb"
                : "";
        if (code) badge.dataset.kdFlag = code;
        const emoji = badge.querySelector<HTMLElement>("span[aria-hidden='true']");
        if (emoji) emoji.hidden = true;
      });

      const bookingTitle = document.getElementById("booking-title");
      const bookingDialog = bookingTitle?.closest<HTMLElement>("[role='dialog']");
      if (bookingTitle && bookingDialog && !bookingDialog.querySelector(".kd-booking-timezone")) {
        const note = document.createElement("p");
        note.className = "kd-booking-timezone";
        note.dataset.kdNoTranslate = "true";
        note.textContent = currentLocale() === "en"
          ? "Times are shown in Moscow time (GMT+3)."
          : "Время указано по Москве (GMT+3).";
        bookingTitle.parentElement?.appendChild(note);
      }

      if (usTime) {
        bookingDialog?.querySelectorAll<HTMLButtonElement>(".kd-booking-slot").forEach((slot) => {
          if (slot.dataset.kdUsTime) return;
          const time = slot.textContent?.trim() ?? "";
          const duplicate = toAmPm(time);
          if (!duplicate) return;
          slot.dataset.kdUsTime = "true";
          slot.dataset.kdNoTranslate = "true";
          slot.textContent = "";
          const primary = document.createElement("span");
          primary.textContent = time;
          const secondary = document.createElement("small");
          secondary.textContent = duplicate;
          slot.append(primary, secondary);
        });
      }
    };

    enhanceInterface();
    const observer = new MutationObserver(enhanceInterface);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const switches = new Set<HTMLElement>();

    const syncTone = () => {
      const inverse =
        window.location.pathname === "/" &&
        Boolean(document.querySelector(".kd-hero")) &&
        (document.querySelector(".kd-hero")?.getBoundingClientRect().bottom ?? 0) > 0 &&
        document.querySelector('.kd-burger[aria-expanded="true"]') === null;
      switches.forEach((control) => {
        control.dataset.inverse = inverse ? "true" : "false";
      });
    };

    const connectSwitch = () => {
      const actionRow = document.querySelector<HTMLElement>(
        "header > .kd-container .kd-cta-desktop",
      )?.parentElement;
      if (!actionRow || actionRow.querySelector(".kd-language-switch")) {
        syncTone();
        return;
      }

      const control = document.createElement("div");
      control.className = "kd-language-switch";
      control.dataset.kdNoTranslate = "true";
      control.setAttribute("role", "group");
      control.setAttribute("aria-label", "Switch site language");

      for (const locale of ["ru", "en"] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = locale.toUpperCase();
        button.dataset.locale = locale;
        button.classList.toggle("is-active", currentLocale() === locale);
        button.setAttribute("aria-pressed", String(currentLocale() === locale));
        button.addEventListener("click", () => {
          if (currentLocale() !== locale) selectLocale(locale);
        });
        control.appendChild(button);
      }

      actionRow.insertBefore(control, actionRow.firstChild);
      switches.add(control);
      syncTone();
    };

    connectSwitch();
    const observer = new MutationObserver(connectSwitch);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", syncTone, { passive: true });
    window.addEventListener("resize", syncTone);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", syncTone);
      window.removeEventListener("resize", syncTone);
      switches.forEach((control) => control.remove());
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const telegramWindow = window as typeof window & {
      Telegram?: { WebApp?: unknown };
      TelegramWebviewProxy?: unknown;
    };
    const forcedTelegramMode =
      params.get("telegram") === "1" || params.get("tg") === "1";
    const detectedTelegramMode =
      /Telegram(?:-iOS|-Android)?/i.test(navigator.userAgent) ||
      Boolean(telegramWindow.TelegramWebviewProxy) ||
      Boolean(telegramWindow.Telegram?.WebApp);
    let telegramMode = forcedTelegramMode || detectedTelegramMode;

    try {
      if (forcedTelegramMode) {
        sessionStorage.setItem("kd-telegram-view", "1");
      } else if (sessionStorage.getItem("kd-telegram-view") === "1") {
        telegramMode = true;
      }
    } catch {
      // The URL signal still works when webview storage is unavailable.
    }

    document.documentElement.classList.toggle(
      "kd-telegram-webview",
      telegramMode,
    );

    return () => {
      document.documentElement.classList.remove("kd-telegram-webview");
    };
  }, []);

  useEffect(() => {
    const scrollToCurrentHash = () => {
      if (window.location.pathname !== "/" || !window.location.hash) return true;

      const id = decodeURIComponent(window.location.hash.slice(1));
      const section = document.getElementById(id);
      if (!section) return false;

      section.scrollIntoView({ behavior: "auto", block: "start" });
      return true;
    };

    const handleHeaderAnchorClick = (event: MouseEvent) => {
      if (window.location.pathname === "/") return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>('header a[href^="#"]');
      const hash = link?.getAttribute("href");
      if (!hash) return;

      event.preventDefault();
      window.location.assign(`/${hash}`);
    };

    const handleMobileMenuBackdropClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const menu = target.closest(".kd-menu-mobile");
      if (!menu || target.closest("nav")) return;

      document
        .querySelector<HTMLButtonElement>('.kd-burger[aria-expanded="true"]')
        ?.click();
    };

    document.addEventListener("click", handleHeaderAnchorClick);
    document.addEventListener("click", handleMobileMenuBackdropClick);

    let observer: MutationObserver | undefined;
    let observerTimeout: ReturnType<typeof window.setTimeout> | undefined;

    if (!scrollToCurrentHash()) {
      observer = new MutationObserver(() => {
        if (scrollToCurrentHash()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      observerTimeout = window.setTimeout(() => observer?.disconnect(), 5000);
    }

    return () => {
      document.removeEventListener("click", handleHeaderAnchorClick);
      document.removeEventListener("click", handleMobileMenuBackdropClick);
      observer?.disconnect();
      if (observerTimeout) window.clearTimeout(observerTimeout);
    };
  }, []);

  useEffect(() => {
    const replacements = new Map([
      [
        "Не нашли нужную услугу? Разработка сайта, дизайн презентаций, коммуникационный дизайн и другое - обсудим формат под твою задачу.",
        "В списке нет нужной услуги? Разработка сайта, дизайн презентаций, коммуникационный дизайн и другое - обсудим формат под твою задачу.",
      ],
      [
        "Чем для вас обернётся наше сотрудничество и что получит ваш бренд.",
        "Чем для тебя обернётся наше сотрудничество и что получит твой бренд.",
      ],
    ]);

    const replaceCopy = (root: Node) => {
      const replaceTextNode = (node: Node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) return;

        let nextValue = node.nodeValue;
        for (const [source, replacement] of replacements) {
          nextValue = nextValue.replace(source, replacement);
        }

        if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
      };

      replaceTextNode(root);
      if (!(root instanceof Element) && root !== document.body) return;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        replaceTextNode(node);
        node = walker.nextNode();
      }
    };

    replaceCopy(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") replaceCopy(mutation.target);
        mutation.addedNodes.forEach(replaceCopy);
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 720px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const observedProcessCards = new Set<HTMLElement>();
    const hintedProcessCards = new WeakSet<HTMLElement>();
    const processHintTimeouts = new Map<HTMLElement, number>();

    const clearProcessHint = (card: HTMLElement) => {
      const timeout = processHintTimeouts.get(card);
      if (timeout) window.clearTimeout(timeout);
      processHintTimeouts.delete(card);
      card.classList.remove("kd-process-hint");
    };

    const processObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const card = entry.target as HTMLElement;
          hintedProcessCards.add(card);
          card.classList.add("kd-process-hint");
          const inner = card.querySelector<HTMLElement>(".kd-process-inner");
          const finishHint = () => clearProcessHint(card);
          inner?.addEventListener("animationend", finishHint, { once: true });
          processHintTimeouts.set(
            card,
            window.setTimeout(finishHint, 1600),
          );
          processObserver.unobserve(card);
          observedProcessCards.delete(card);
        }
      },
      { threshold: 0.58 },
    );

    const connectProcessHint = () => {
      if (!mobileQuery.matches || reducedMotionQuery.matches) {
        observedProcessCards.forEach((card) => processObserver.unobserve(card));
        observedProcessCards.clear();
        return;
      }

      document
        .querySelectorAll<HTMLElement>("#process .kd-process-card")
        .forEach((card) => {
          if (
            card.classList.contains("kd-process-hint") ||
            hintedProcessCards.has(card) ||
            observedProcessCards.has(card)
          ) {
            return;
          }

          observedProcessCards.add(card);
          processObserver.observe(card);
        });
    };

    const handleProcessPointerDown = (event: PointerEvent) => {
      if (!mobileQuery.matches) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const card = target.closest<HTMLElement>("#process .kd-process-card");
      if (card) clearProcessHint(card);
    };

    const heroSwipeCleanups = new Map<HTMLElement, () => void>();
    let suppressHeroClickUntil = 0;

    const handleHeroClickCapture = (event: MouseEvent) => {
      if (Date.now() >= suppressHeroClickUntil) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".kd-hero")) return;

      event.preventDefault();
      event.stopPropagation();
    };

    const connectHeroSwipe = () => {
      if (!mobileQuery.matches) {
        heroSwipeCleanups.forEach((cleanup) => cleanup());
        heroSwipeCleanups.clear();
        return;
      }

      document.querySelectorAll<HTMLElement>(".kd-hero").forEach((hero) => {
        if (heroSwipeCleanups.has(hero)) return;

        let startX = 0;
        let startY = 0;
        let tracking = false;

        const handleTouchStart = (event: TouchEvent) => {
          if (event.touches.length !== 1) return;
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("a, button:not(.kd-hero-open)")
          ) {
            return;
          }

          startX = event.touches[0].clientX;
          startY = event.touches[0].clientY;
          tracking = true;
        };

        const stopTracking = () => {
          tracking = false;
        };

        const handleTouchEnd = (event: TouchEvent) => {
          if (!tracking || event.changedTouches.length !== 1) return;
          tracking = false;

          const deltaX = event.changedTouches[0].clientX - startX;
          const deltaY = event.changedTouches[0].clientY - startY;
          if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
            return;
          }

          const controls = Array.from(
            hero.querySelectorAll<HTMLButtonElement>(".kd-hero-tl"),
          );
          if (controls.length < 2) return;

          event.preventDefault();
          const activeIndex = Math.max(
            0,
            controls.findIndex((control) =>
              control.classList.contains("is-active"),
            ),
          );
          const direction = deltaX < 0 ? 1 : -1;
          const nextIndex =
            (activeIndex + direction + controls.length) % controls.length;
          controls[nextIndex].click();
          suppressHeroClickUntil = Date.now() + 500;
        };

        hero.addEventListener("touchstart", handleTouchStart, { passive: true });
        hero.addEventListener("touchend", handleTouchEnd, { passive: false });
        hero.addEventListener("touchcancel", stopTracking, { passive: true });

        heroSwipeCleanups.set(hero, () => {
          hero.removeEventListener("touchstart", handleTouchStart);
          hero.removeEventListener("touchend", handleTouchEnd);
          hero.removeEventListener("touchcancel", stopTracking);
        });
      });
    };

    const reviewVideos = new Set<HTMLVideoElement>();
    const preparedVideos = new WeakSet<HTMLVideoElement>();
    const videoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && !document.hidden) {
            void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "120px 0px", threshold: 0.05 },
    );

    const prepareReviewVideos = () => {
      document
        .querySelectorAll<HTMLVideoElement>(".kd-reviews-video__media")
        .forEach((video) => {
          if (preparedVideos.has(video)) return;

          preparedVideos.add(video);
          reviewVideos.add(video);
          video.muted = true;
          video.defaultMuted = true;
          video.playsInline = true;
          video.loop = true;
          video.autoplay = true;
          video.setAttribute("muted", "");
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          video.setAttribute("preload", "auto");
          video.addEventListener("ended", () => {
            video.currentTime = 0;
            void video.play().catch(() => undefined);
          });
          videoObserver.observe(video);
        });
    };

    const syncProjectModalShell = () => {
      const gallery = document.querySelector(".kd-modal-gallery");
      const dialog = gallery?.closest<HTMLElement>('[role="dialog"]');
      const shell = dialog?.parentElement ?? null;

      document
        .querySelectorAll<HTMLElement>(".kd-project-modal-shell")
        .forEach((element) => {
          if (element !== shell) element.classList.remove("kd-project-modal-shell");
        });

      shell?.classList.add("kd-project-modal-shell");
      document.documentElement.classList.toggle(
        "kd-project-modal-open",
        Boolean(shell),
      );
    };

    const syncMobileMenuShell = () => {
      const menu = document.querySelector<HTMLElement>(".kd-menu-mobile");
      const header = menu?.closest<HTMLElement>("header") ?? null;
      const pageHeader = document.querySelector<HTMLElement>("header");
      let chrome = document.querySelector<HTMLElement>(
        ".kd-mobile-menu-chrome",
      );

      document
        .querySelectorAll<HTMLElement>(".kd-mobile-menu-host")
        .forEach((element) => {
          if (element !== header) element.classList.remove("kd-mobile-menu-host");
        });

      header?.classList.add("kd-mobile-menu-host");
      document.documentElement.classList.toggle(
        "kd-mobile-menu-open",
        Boolean(menu),
      );

      if (!mobileQuery.matches || !pageHeader) {
        chrome?.remove();
        return;
      }

      if (chrome) {
        chrome.hidden = !menu;
        return;
      }

      chrome = document.createElement("div");
      chrome.className = "kd-mobile-menu-chrome";

      const inner = document.createElement("div");
      inner.className = "kd-mobile-menu-chrome__inner kd-container";

      const logo = document.createElement("button");
      logo.type = "button";
      logo.className = "kd-mobile-menu-chrome__logo";
      logo.setAttribute("aria-label", "КОРЯГИН ДИЗАЙН - на главную");
      logo.addEventListener("click", () => {
        document
          .querySelector<HTMLButtonElement>('.kd-burger[aria-expanded="true"]')
          ?.click();
        window.setTimeout(() => {
          document
            .querySelector<HTMLAnchorElement>(
              "header > .kd-container a[aria-label*='КОРЯГИН ДИЗАЙН']",
            )
            ?.click();
        }, 0);
      });

      const originalLogo = pageHeader.querySelector<HTMLImageElement>(
        "a[aria-label*='КОРЯГИН ДИЗАЙН'] img",
      );
      const logoImage = originalLogo
        ? (originalLogo.cloneNode(true) as HTMLImageElement)
        : document.createElement("img");
      logoImage.removeAttribute("style");
      logoImage.src ||= currentLocale() === "en"
        ? "/assets/logos/eng-logo-horizontal-dark.svg"
        : "/assets/logos/logo-wordmark-stacked-ink.svg";
      logoImage.alt = currentLocale() === "en"
        ? "KORYAGIN DESIGN™"
        : "КОРЯГИН ДИЗАЙН™";
      logo.appendChild(logoImage);
      if (!logoImage.complete) void logoImage.decode().catch(() => undefined);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "kd-mobile-menu-chrome__close";
      close.setAttribute("aria-label", "Закрыть меню");
      close.addEventListener("click", () => {
        document
          .querySelector<HTMLButtonElement>(
            '.kd-burger[aria-expanded="true"]',
          )
          ?.click();
      });

      const closeIcon = document.createElement("span");
      closeIcon.setAttribute("aria-hidden", "true");
      close.appendChild(closeIcon);

      inner.append(logo, close);
      chrome.appendChild(inner);
      chrome.hidden = !menu;
      document.body.appendChild(chrome);
    };

    const resumeVisibleReviewVideos = () => {
      if (document.hidden) return;
      reviewVideos.forEach((video) => {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          void video.play().catch(() => undefined);
        }
      });
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) resumeVisibleReviewVideos();
    };

    const handlePageShow = () => resumeVisibleReviewVideos();
    const handleFirstTouch = () => resumeVisibleReviewVideos();

    connectProcessHint();
    connectHeroSwipe();
    prepareReviewVideos();
    syncProjectModalShell();
    syncMobileMenuShell();

    const observer = new MutationObserver(() => {
      connectProcessHint();
      connectHeroSwipe();
      prepareReviewVideos();
      syncProjectModalShell();
      syncMobileMenuShell();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    mobileQuery.addEventListener("change", connectProcessHint);
    mobileQuery.addEventListener("change", connectHeroSwipe);
    mobileQuery.addEventListener("change", syncMobileMenuShell);
    reducedMotionQuery.addEventListener("change", connectProcessHint);
    document.addEventListener("pointerdown", handleProcessPointerDown, true);
    document.addEventListener("click", handleHeroClickCapture, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("touchstart", handleFirstTouch, {
      passive: true,
      once: true,
    });

    return () => {
      observer.disconnect();
      processObserver.disconnect();
      processHintTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      processHintTimeouts.clear();
      heroSwipeCleanups.forEach((cleanup) => cleanup());
      heroSwipeCleanups.clear();
      videoObserver.disconnect();
      document.documentElement.classList.remove("kd-project-modal-open");
      document.documentElement.classList.remove("kd-mobile-menu-open");
      document
        .querySelectorAll<HTMLElement>(".kd-project-modal-shell")
        .forEach((element) => element.classList.remove("kd-project-modal-shell"));
      document
        .querySelectorAll<HTMLElement>(".kd-mobile-menu-host")
        .forEach((element) => element.classList.remove("kd-mobile-menu-host"));
      document.querySelector(".kd-mobile-menu-chrome")?.remove();
      mobileQuery.removeEventListener("change", connectProcessHint);
      mobileQuery.removeEventListener("change", connectHeroSwipe);
      mobileQuery.removeEventListener("change", syncMobileMenuShell);
      reducedMotionQuery.removeEventListener("change", connectProcessHint);
      document.removeEventListener("pointerdown", handleProcessPointerDown, true);
      document.removeEventListener("click", handleHeroClickCapture, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("touchstart", handleFirstTouch);
    };
  }, []);

  return null;
}
