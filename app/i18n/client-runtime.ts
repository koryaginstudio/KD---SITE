import { GEO_LOCALE_COOKIE, MANUAL_LOCALE_COOKIE, SiteLocale } from "./locale";
import {
  projectSourceTranslations,
  projectTranslations,
  projectTypeSourceTranslations,
  projectTypeTranslations,
} from "./project-translations";
import { staticTranslations, translateDynamicText } from "./static-translations";

type LocalizedPair = {
  source: Record<string, string>;
  target: Record<string, string>;
};

type LocalizedPayload = {
  projects?: LocalizedPair[];
  projectTypes?: Array<{ source: string; target: string }>;
};

const translatableAttributes = ["aria-label", "placeholder", "title", "alt"];

export function currentLocale(): SiteLocale {
  return document.documentElement.dataset.kdLocale === "en" ? "en" : "ru";
}

export function selectLocale(locale: SiteLocale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${MANUAL_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(MANUAL_LOCALE_COOKIE, locale);
  } catch {
    // The cookie remains the source of truth when storage is unavailable.
  }
  window.location.reload();
}

export function installEnglishLocalization() {
  if (currentLocale() !== "en") {
    markLocaleReady();
    return () => undefined;
  }

  const translations = new Map(Object.entries(staticTranslations));
  const sourceProjects = new Map(
    projectSourceTranslations.map((project) => [project.slug, project]),
  );
  for (const project of projectTranslations) {
    const source = sourceProjects.get(project.slug);
    if (!source) continue;
    for (const field of [
      "title",
      "category",
      "service",
      "task",
      "solution",
      "summary",
    ] as const) {
      if (source[field] && project[field]) {
        translations.set(source[field], project[field]);
      }
    }
  }
  for (const [slug, target] of Object.entries(projectTypeTranslations)) {
    const source = projectTypeSourceTranslations[slug];
    if (source && target) translations.set(source, target);
  }
  let active = true;
  let translating = false;

  const translateValue = (value: string) => {
    const trimmed = value.trim();
    const exact = translations.get(trimmed);
    if (exact) return value.replace(trimmed, exact);
    return translateDynamicText(value);
  };

  const translateNode = (root: Node) => {
    if (!active || translating) return;
    translating = true;
    try {
      const translateTextNode = (node: Node) => {
        if (
          node.nodeType !== Node.TEXT_NODE ||
          !node.nodeValue ||
          node.parentElement?.closest("script, style, textarea, [data-kd-no-translate]")
        ) {
          return;
        }
        const translated = translateValue(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      };

      const translateElement = (element: Element) => {
        for (const attribute of translatableAttributes) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          const translated = translateValue(value);
          if (translated !== value) element.setAttribute(attribute, translated);
        }
      };

      translateTextNode(root);
      if (root instanceof Element) translateElement(root);
      if (!(root instanceof Element) && root !== document.body) return;

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        else if (node instanceof Element) translateElement(node);
        node = walker.nextNode();
      }
    } finally {
      translating = false;
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateNode(mutation.target);
      mutation.addedNodes.forEach(translateNode);
      if (mutation.type === "attributes") translateNode(mutation.target);
    }
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: translatableAttributes,
    childList: true,
    characterData: true,
    subtree: true,
  });

  translateNode(document.body);
  updateEnglishMetadata();
  markLocaleReady();

  void fetch("/api/portfolio-localized", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Localized content request failed");
      return (await response.json()) as LocalizedPayload;
    })
    .then((payload) => {
      for (const project of payload.projects ?? []) {
        for (const [field, source] of Object.entries(project.source)) {
          const target = project.target[field];
          if (source && target && source !== target) translations.set(source, target);
        }
      }
      for (const projectType of payload.projectTypes ?? []) {
        if (projectType.source && projectType.target) {
          translations.set(projectType.source, projectType.target);
        }
      }
      translateNode(document.body);
    })
    .catch((error) => console.error("English portfolio content is unavailable", error));

  return () => {
    active = false;
    observer.disconnect();
  };
}

export function clearAutomaticLocaleCookie() {
  document.cookie = `${GEO_LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function markLocaleReady() {
  document.documentElement.classList.add("kd-locale-ready");
  window.dispatchEvent(new Event("kd-locale-ready"));
}

function updateEnglishMetadata() {
  const title = "KORYAGIN DESIGN™ | Branding, Visual Identity, Logo Design";
  const description =
    "I create design that works for your business, builds trust and strengthens its value. From street art to effective design solutions.";
  document.title = title;
  setMeta("meta[name='description']", description);
  setMeta("meta[property='og:title']", title);
  setMeta("meta[property='og:description']", description);
  setMeta("meta[property='og:locale']", "en_US");
  setMeta("meta[name='twitter:title']", title);
  setMeta("meta[name='twitter:description']", description);
}

function setMeta(selector: string, value: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
}
