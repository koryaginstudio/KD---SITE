/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleAdminGet, handleAdminPost } from "../app/lib/admin-api-core";
import { handleBookingAdminRequest } from "../app/lib/booking-admin-api";
import { ADMIN_EMAIL } from "../app/lib/admin-identity";
import { rejectCrossOriginMutation } from "../app/lib/request-security";
import {
  handleBookingAvailabilityRequest,
  handleSubmissionRequest,
} from "../app/lib/submission-api";
import {
  COUNTRY_COOKIE,
  GEO_LOCALE_COOKIE,
  hasManualLocale,
  requestCountry,
  requestLocale,
} from "../app/i18n/locale";

interface Env {
  ASSETS: Fetcher;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_RECIPIENT_CHAT_IDS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_ANALYTICS_ID?: string;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const locale = requestLocale(request);
    const country = requestCountry(request);
    let response: Response;

    if (
      (url.hostname === "www.koryagindesign.com" || url.protocol === "http:") &&
      (url.hostname === "koryagindesign.com" || url.hostname === "www.koryagindesign.com")
    ) {
      const canonical = new URL(request.url);
      canonical.protocol = "https:";
      canonical.hostname = "koryagindesign.com";
      return withSecurityHeaders(Response.redirect(canonical, 308), request, locale, country);
    }

    if (url.pathname === "/api/booking-availability") {
      response = await handleBookingAvailabilityRequest(request, env);
    } else if (url.pathname === "/api/analytics-config") {
      response = analyticsConfig(request, env);
    } else if (url.pathname === "/api/leads" || url.pathname === "/api/bookings") {
      response = await handleSubmissionRequest(request, env, ctx, url.pathname);
    } else if (
      url.pathname === "/api/portfolio-admin" ||
      url.pathname === "/api/portfolio-command" ||
      url.pathname === "/api/portfolio-media" ||
      url.pathname === "/api/admin-bookings"
    ) {
      response = await handleAdminRequest(request, env, url.pathname);
    } else if (url.pathname === "/_vinext/image") {
      const sourcePath = url.searchParams.get("url");
      if (!env.IMAGES) {
        response = sourcePath && sourcePath.startsWith("/") && !sourcePath.startsWith("//")
          ? await env.ASSETS.fetch(new Request(new URL(sourcePath, request.url)))
          : new Response("Invalid image URL", { status: 400 });
        return withSecurityHeaders(response, request, locale, country);
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    } else {
      const headers = new Headers(request.headers);
      headers.set("x-kd-locale", locale);
      response = await handler.fetch(new Request(request, { headers }), env, ctx);
    }

    return withSecurityHeaders(response, request, locale, country);
  },
};

export default worker;

async function handleAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
) {
  const allow = pathname === "/api/admin-bookings"
    ? "GET, HEAD, POST, OPTIONS"
    : pathname === "/api/portfolio-admin"
      ? "GET, HEAD, OPTIONS"
      : "POST, OPTIONS";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: allow } });
  }

  const email = (
    request.headers.get("oai-authenticated-user-email") ??
    request.headers.get("cf-access-authenticated-user-email")
  )
    ?.trim()
    .toLowerCase();
  if (!email) return adminJson({ error: "Требуется авторизация" }, 401);
  if (email !== ADMIN_EMAIL) return adminJson({ error: "Нет доступа" }, 403);

  if (request.method === "POST") {
    const originError = rejectCrossOriginMutation(request);
    if (originError) return originError;
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return adminJson(
      { error: "Панель ещё не подключена к ключу управления Supabase" },
      500,
    );
  }

  if (
    pathname === "/api/admin-bookings" &&
    (request.method === "GET" || request.method === "HEAD" || request.method === "POST")
  ) {
    return handleBookingAdminRequest(request, env);
  }

  if (
    pathname === "/api/portfolio-admin" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const response = await handleAdminGet(serviceKey);
    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }
    return response;
  }

  if (
    (pathname === "/api/portfolio-command" ||
      pathname === "/api/portfolio-media") &&
    request.method === "POST"
  ) {
    return handleAdminPost(request, serviceKey);
  }

  return adminJson(
    { error: "Метод не поддерживается" },
    405,
    { Allow: allow },
  );
}

function withSecurityHeaders(
  response: Response,
  request: Request,
  locale: "ru" | "en",
  country: string,
) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://ddbsprjohemfmaasrzgg.supabase.co wss://ddbsprjohemfmaasrzgg.supabase.co https://mc.yandex.ru https://mc.yandex.com https://www.google-analytics.com https://region1.google-analytics.com",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://ddbsprjohemfmaasrzgg.supabase.co https://mc.yandex.ru https://mc.yandex.com",
    "manifest-src 'self'",
    "media-src 'self' blob: https://ddbsprjohemfmaasrzgg.supabase.co",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://mc.yandex.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests",
    "worker-src 'self' blob:",
  ].join("; "));
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Content-Language", locale);

  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    headers.set("Cache-Control", "no-store, max-age=0");
  }

  if (
    !hasManualLocale(request) &&
    (headers.get("content-type") ?? "").includes("text/html")
  ) {
    headers.append(
      "Set-Cookie",
      `${GEO_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=86400; SameSite=Lax; Secure`,
    );
  }

  if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.append(
      "Set-Cookie",
      `${COUNTRY_COOKIE}=${country || "XX"}; Path=/; Max-Age=86400; SameSite=Lax; Secure`,
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function analyticsConfig(request: Request, env: Env) {
  const allow = "GET, HEAD, OPTIONS";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: allow } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return adminJson({ error: "Метод не поддерживается" }, 405, { Allow: allow });
  }

  const candidate = env.GOOGLE_ANALYTICS_ID?.trim() ?? "";
  const googleAnalyticsId = /^G-[A-Z0-9]+$/i.test(candidate) ? candidate : "";
  const response = Response.json(
    { googleAnalyticsId },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
  if (request.method === "HEAD") {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

function adminJson(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
