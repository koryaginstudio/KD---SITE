export type SiteLocale = "ru" | "en";

export const MANUAL_LOCALE_COOKIE = "kd_language";
export const GEO_LOCALE_COOKIE = "kd_geo_language";
export const COUNTRY_COOKIE = "kd_country";

const RUSSIAN_DEFAULT_COUNTRIES = new Set([
  "AM",
  "AZ",
  "BY",
  "GE",
  "KZ",
  "KG",
  "MD",
  "RU",
  "TJ",
  "TM",
  "UA",
  "UZ",
]);

type CloudflareRequest = Request & {
  cf?: { country?: string };
};

export function normalizeLocale(value: string | null | undefined): SiteLocale | null {
  const locale = value?.trim().toLowerCase();
  return locale === "ru" || locale === "en" ? locale : null;
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function requestLocale(request: Request): SiteLocale {
  const manual = normalizeLocale(readCookie(request, MANUAL_LOCALE_COOKIE));
  if (manual) return manual;

  if (/YaBrowser/i.test(request.headers.get("user-agent") ?? "")) return "ru";

  const country = requestCountry(request);
  if (country && country !== "XX") {
    return RUSSIAN_DEFAULT_COUNTRIES.has(country) ? "ru" : "en";
  }

  const accepted = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return /(^|,)\s*(ru|uk|be|kk|ky|hy|az|uz|tg|tk|ka)(-|;|,|$)/.test(
    accepted,
  )
    ? "ru"
    : "en";
}

export function requestCountry(request: Request) {
  const cloudflareCountry = (request as CloudflareRequest).cf?.country;
  return (
    cloudflareCountry ?? request.headers.get("cf-ipcountry") ?? ""
  ).toUpperCase();
}

export function hasManualLocale(request: Request) {
  return Boolean(normalizeLocale(readCookie(request, MANUAL_LOCALE_COOKIE)));
}

export function localeBootstrapScript() {
  return `(function(){
    var read=function(name){var parts=document.cookie.split(';');for(var i=0;i<parts.length;i++){var pair=parts[i].trim().split('=');if(pair[0]===name)return decodeURIComponent(pair.slice(1).join('='));}return '';};
    var manual=read('${MANUAL_LOCALE_COOKIE}');
    var automatic=read('${GEO_LOCALE_COOKIE}');
    var stored='';
    try{stored=localStorage.getItem('${MANUAL_LOCALE_COOKIE}')||'';}catch(e){}
    var locale=(manual==='ru'||manual==='en')?manual:(stored==='ru'||stored==='en')?stored:(automatic==='ru'||automatic==='en')?automatic:(/^ru\b|^uk\b|^be\b/i.test(navigator.language||'')?'ru':'en');
    document.documentElement.lang=locale;
    document.documentElement.dataset.kdLocale=locale;
    window.__KD_LOCALE__=locale;
  })();`;
}
