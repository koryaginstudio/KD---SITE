import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeEnv = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const runtimeContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

test("renders the production site shell and analytics", async () => {
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>КОРЯГИН ДИЗАЙН™/i);
  assert.match(
    html,
    /КОРЯГИН ДИЗАЙН™ – Айдентика, брендинг, логотипы/,
  );
  assert.match(
    html,
    /Создаю дизайн, который работает на ваш бизнес и помогает завоевывать доверие клиентов и поднимать средний чек\./,
  );
  assert.match(html, /\/assets\/index-[A-Za-z0-9_-]+\.css/i);
  assert.match(html, /\/assets\/index-[A-Za-z0-9_-]+\.js/i);
  assert.match(html, /mc\.yandex\.ru\/metrika\/tag\.js\?id=111869692/i);
});

test("keeps the first-screen portfolio rotation at four seconds", async () => {
  const homeBundle = await readFile(
    "public/assets/Home-Ci4Ubwy0.js",
    "utf8",
  );

  assert.match(homeBundle, /W=4e3/);
  assert.doesNotMatch(homeBundle, /W=6e3/);
});

test("publishes the Telegram preview image and .com metadata", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://example.test/", { headers: { accept: "text/html" } }),
    runtimeEnv,
    runtimeContext,
  );
  const html = await response.text();
  const image = await readFile("public/og-image.jpg");

  assert.match(html, /property="og:image" content="https:\/\/koryagindesign\.com\/og-image\.jpg"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.ok(image.byteLength > 50_000);
});

test("selects the default language by country and respects a manual choice", async () => {
  const worker = await loadWorker();

  const russian = await worker.fetch(
    new Request("https://example.test/", {
      headers: { accept: "text/html", "cf-ipcountry": "BY" },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(russian.headers.get("content-language"), "ru");
  assert.match(russian.headers.get("set-cookie") ?? "", /kd_geo_language=ru/);

  const english = await worker.fetch(
    new Request("https://example.test/", {
      headers: { accept: "text/html", "cf-ipcountry": "DE" },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(english.headers.get("content-language"), "en");

  const manual = await worker.fetch(
    new Request("https://example.test/", {
      headers: {
        accept: "text/html",
        "cf-ipcountry": "RU",
        cookie: "kd_language=en",
      },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(manual.headers.get("content-language"), "en");
  assert.doesNotMatch(manual.headers.get("set-cookie") ?? "", /kd_geo_language=/);

  const yandex = await worker.fetch(
    new Request("https://example.test/", {
      headers: {
        accept: "text/html",
        "cf-ipcountry": "DE",
        "user-agent": "Mozilla/5.0 YaBrowser/26.8.0.0",
      },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(yandex.headers.get("content-language"), "ru");

  const manualYandex = await worker.fetch(
    new Request("https://example.test/", {
      headers: {
        accept: "text/html",
        "cf-ipcountry": "DE",
        "user-agent": "Mozilla/5.0 YaBrowser/26.8.0.0",
        cookie: "kd_language=en",
      },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(manualYandex.headers.get("content-language"), "en");

  const unitedStates = await worker.fetch(
    new Request("https://example.test/", {
      headers: { accept: "text/html", "cf-ipcountry": "US" },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.match(unitedStates.headers.get("set-cookie") ?? "", /kd_country=US/);
});

test("ships complete English case fields and admin support", async () => {
  const [translations, migration, adminApi] = await Promise.all([
    readFile("app/i18n/project-translations.ts", "utf8"),
    readFile("supabase/i18n-migration.sql", "utf8"),
    readFile("app/lib/admin-api-core.ts", "utf8"),
  ]);

  for (const slug of [
    "koryagin-design",
    "flamin-go",
    "gsm-store",
    "pants-bands",
    "saintnic",
    "verifiq",
    "yellowtech",
    "aura",
    "lumina-glow",
    "slavtrad",
    "saad",
    "i-hate-mondays",
    "f-cking-problems",
    "da-kosta",
  ]) {
    assert.match(translations, new RegExp(`slug: "${slug}"`));
    assert.match(migration, new RegExp(`"slug": "${slug}"`));
  }

  for (const field of [
    "title_en",
    "category_en",
    "service_en",
    "task_en",
    "solution_en",
    "summary_en",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
    assert.match(adminApi, new RegExp(`"${field}"`));
  }
});

test("keeps the impact section fully English and compacts mobile notices", async () => {
  const [translations, styles] = await Promise.all([
    readFile("app/i18n/static-translations.ts", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  for (const fragment of [
    '"в упаковке": "in your brand presentation"',
    '"вместо хаоса": "instead of visual noise"',
    '"Сильное": "A strong"',
    '", а не просто компании": " not just a company"',
  ]) {
    assert.ok(translations.includes(fragment), fragment);
  }

  for (const source of [
    "Что проект даст бизнесу",
    "Чем для вас обернётся наше сотрудничество и что получит ваш бренд.",
    "Твой продукт перестанет выглядеть собранным «на глаз».",
    "Сайт, соцсети, презентации, упаковка и рекламные материалы",
    "Клиент быстрее считывает бренд и понимает, кому и почему он доверяет.",
    "Бренд начинает восприниматься дороже и собраннее.",
    "Брендинг GSM-Store: фирменный грузовик, вывеска и иконка приложения",
    "Мерч и упаковка бренда PANTS BANDS",
    "* на примере кейса GSM-STORE из портфолио",
    "* на примере кейса PANTS BANDS из портфолио",
  ]) {
    assert.ok(translations.includes(source), source);
  }

  assert.match(styles, /data-kd-locale="en"\] \.kd-quote__en/);
  assert.match(styles, /body:has\(\.cookie-banner\) \.kd-floating-social/);
  assert.match(styles, /body:has\(\.kd-quiz-widget\) \.kd-floating-social/);
  assert.match(styles, /\.kd-quiz-widget \{[\s\S]*?bottom: calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\) !important/);
});

test("keeps English services, three O titles and admin fields consistent", async () => {
  const [translations, projects, admin, migration, runtime] = await Promise.all([
    readFile("app/i18n/static-translations.ts", "utf8"),
    readFile("app/i18n/project-translations.ts", "utf8"),
    readFile("app/admin/admin-panel.tsx", "utf8"),
    readFile("supabase/i18n-migration.sql", "utf8"),
    readFile("app/i18n/client-runtime.ts", "utf8"),
  ]);

  for (const source of [translations, projects, migration, runtime]) {
    assert.doesNotMatch(source, /Brand Identity/i);
  }
  assert.match(translations, /"Айдентика": "Visual Identity"/);
  assert.match(translations, /"Открытость к идеям": "Openness to Ideas"/);
  assert.match(translations, /"Ориентация на результат": "Outcome Focus"/);
  assert.match(translations, /"Оперативность": "Operational Speed"/);
  assert.match(translations, /"к идеям": "to Ideas"/);
  assert.match(translations, /"Ориентация": "Outcome"/);
  assert.match(translations, /"на результат": "Focus"/);
  assert.match(admin, /ENGLISH VERSION/);
  assert.match(admin, /English case content/);
  for (const field of ["title_en", "category_en", "summary_en", "task_en", "solution_en"]) {
    assert.match(admin, new RegExp(field));
  }
});

test("uses compact service rules and static process-card backgrounds", async () => {
  const [homeBundle, styles, fixes] = await Promise.all([
    readFile("public/assets/Home-Ci4Ubwy0.js", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/client-fixes.tsx", "utf8"),
  ]);

  assert.doesNotMatch(homeBundle, /minHeight:"4\.5em"/);
  assert.doesNotMatch(homeBundle, /process-back-loop\.mp4/);
  assert.doesNotMatch(fixes, /syncProcessVideos/);
  assert.match(styles, /#process \.kd-process-back \{[\s\S]*?process-back-mobile\.webp/);
  assert.match(styles, /#impact \.kd-secheading > h2/);
});

test("ships international branding, Moscow booking time and LinkedIn", async () => {
  const [bundle, fixes, styles, translations, loader] = await Promise.all([
    readFile("public/assets/index-xadm5lxP.js", "utf8"),
    readFile("app/client-fixes.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/i18n/static-translations.ts", "utf8"),
    readFile("app/legacy-boot.tsx", "utf8"),
  ]);

  assert.match(bundle, /eng-logo-horizontal-dark\.svg/);
  assert.match(bundle, /eng-logo-horizontal-white\.svg/);
  assert.match(loader, /kd-site-loader__logo-en/);
  assert.match(bundle, /linkedin\.com\/in\/antonkoryagindesign/);
  assert.doesNotMatch(bundle, /vk\.com\/koryagindesign/);
  assert.match(bundle, /LinkedIn:"linkedin"/);
  assert.match(bundle, /Date\.UTC\(n,s-1,i,o-3,a,0,0\)/);
  assert.match(bundle, /G1=30,J1=240/);
  assert.match(bundle, /30 минут\. Работаю каждый день с 10:00 до 21:00\./);
  assert.match(fixes, /Times are shown in Moscow time \(GMT\+3\)/);
  assert.match(fixes, /dataset\.kdFlag/);
  assert.match(styles, /kd-booking-slot\[data-kd-us-time="true"\]/);
  assert.match(styles, /kd-apple-device \.kd-hero-scrim/);
  assert.match(translations, /"Ощущение бренда": "A clear brand feel,"/);
  assert.match(translations, /", а не просто компании": " not just a company"/);

  for (const flag of ["ru", "us", "no", "gb"]) {
    const svg = await readFile(`public/assets/flags/${flag}.svg`, "utf8");
    assert.match(svg, /<svg/);
  }
});

test("is ready for an owner-controlled Cloudflare Worker", async () => {
  const [config, workerSource, authSource] = await Promise.all([
    readFile("wrangler.jsonc", "utf8"),
    readFile("worker/index.ts", "utf8"),
    readFile("app/chatgpt-auth.ts", "utf8"),
  ]);

  assert.match(config, /"name": "koryagin-design"/);
  assert.match(config, /"main": "dist\/server\/index\.js"/);
  assert.match(config, /"directory": "dist\/client"/);
  assert.match(workerSource, /cf-access-authenticated-user-email/);
  assert.match(authSource, /cf-access-authenticated-user-email/);
  assert.match(workerSource, /if \(!env\.IMAGES\)/);
});

test("routes every public form through the protected submission API", async () => {
  const [bridge, workerSource, schema] = await Promise.all([
    readFile("app/legacy-submission-bridge.ts", "utf8"),
    readFile("worker/index.ts", "utf8"),
    readFile("supabase/leads-and-bookings.sql", "utf8"),
  ]);

  for (const legacyEndpoint of [
    "/functions/v1/quiz-submit",
    "/rest/v1/leads",
    "/rest/v1/consultation_bookings",
  ]) {
    assert.ok(bridge.includes(legacyEndpoint), legacyEndpoint);
  }
  assert.match(workerSource, /url\.pathname === "\/api\/leads"/);
  assert.match(workerSource, /url\.pathname === "\/api\/bookings"/);
  assert.match(schema, /alter table public\.lead_submissions enable row level security/);
  assert.match(schema, /consultation_bookings_active_slot_idx/);
  assert.match(schema, /count\(\*\) >= 5/);
  assert.match(schema, /interval '60 minutes'/);
  assert.match(schema, /revoke all on public\.lead_submissions from anon, authenticated/);
});

test("rejects unsafe or unconfigured public submissions", async () => {
  const worker = await loadWorker();
  const crossOrigin = await worker.fetch(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ name: "Test", contact: "test@example.com" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(crossOrigin.status, 403);

  const noStorage = await worker.fetch(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ name: "Test", contact: "test@example.com" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(noStorage.status, 503);
  assert.deepEqual(await noStorage.json(), {
    ok: false,
    error: "storage_not_configured",
  });
});

test("stores the full quiz path before notifying every Telegram recipient", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  const pending = [];
  const telegramMessages = [];
  let storedPayload;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/rest/v1/rpc/submit_lead")) {
      storedPayload = JSON.parse(String(init.body)).p_payload;
      return Response.json([{
        lead_id: "57d9c519-7580-4a83-89a2-68675855211d",
        booking_id: null,
        duplicate: false,
      }]);
    }
    if (url.includes("/rest/v1/lead_deliveries?on_conflict=")) {
      return Response.json([{ id: crypto.randomUUID(), status: "pending" }]);
    }
    if (url.startsWith("https://api.telegram.org/")) {
      telegramMessages.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    if (url.includes("/rest/v1/lead_deliveries?") && init.method === "PATCH") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };

  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
          "sec-fetch-site": "same-origin",
          "cf-ipcountry": "RU",
          "x-submission-key": "e530e775-7471-49b6-82ac-79847756bf22",
        },
        body: JSON.stringify({
          quizVersion: "koryagin_design_quiz_v1",
          source: "hero",
          contact: {
            name: "Антон",
            contact: "@client",
            business: "Studio",
            comment: "Нужен брендинг",
          },
          result: {
            serviceId: "branding",
            serviceName: "Брендинг",
            score: { branding: 3 },
          },
          answers: [{
            questionId: "goal",
            questionTitle: "Что требуется?",
            selectedOptionId: "system",
            selectedOptionLabel: "Полная система",
          }],
          page: { url: "https://koryagindesign.com/", referrer: "https://ya.ru/" },
          utm: { utm_source: "yandex" },
        }),
      }),
      {
        ...runtimeEnv,
        SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_RECIPIENT_CHAT_IDS: "111,222",
      },
      {
        ...runtimeContext,
        waitUntil(promise) { pending.push(promise); },
      },
    );

    assert.equal(response.status, 201);
    assert.equal(storedPayload.kind, "quiz");
    assert.equal(storedPayload.answers[0].selectedOptionLabel, "Полная система");
    await Promise.all(pending);
    assert.equal(telegramMessages.length, 2);
    for (const notification of telegramMessages) {
      assert.match(notification.text, /НОВАЯ ЗАЯВКА ИЗ КВИЗА/);
      assert.match(notification.text, /👤 Имя:/);
      assert.match(notification.text, /📲 Контакт:/);
      assert.match(notification.text, /🧭 <b>Путь по квизу:<\/b>/);
      assert.match(notification.text, /Антон/);
      assert.match(notification.text, /Что требуется\?/);
      assert.match(notification.text, /Полная система/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adds browser security headers without changing the HTML payload", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://example.test/", { headers: { accept: "text/html" } }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
});

test("rejects every legacy admin endpoint without authentication", async () => {
  const worker = await loadWorker();

  for (const [path, method] of [
    ["/api/portfolio-admin", "GET"],
    ["/api/portfolio-command", "POST"],
    ["/api/portfolio-media", "POST"],
  ]) {
    const response = await worker.fetch(
      new Request(`https://example.test${path}`, { method }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: "Требуется авторизация" });
  }
});

test("rejects a wrong admin identity and cross-origin mutations", async () => {
  const worker = await loadWorker();

  const wrongIdentity = await worker.fetch(
    new Request("https://example.test/api/portfolio-admin", {
      headers: { "oai-authenticated-user-email": "someone@example.com" },
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(wrongIdentity.status, 403);

  const crossOrigin = await worker.fetch(
    new Request("https://example.test/api/portfolio-command", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "oai-authenticated-user-email": "koryaginstudio@gmail.com",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: "{}",
    }),
    { ...runtimeEnv, SUPABASE_SERVICE_ROLE_KEY: "test-only-key" },
    runtimeContext,
  );
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(await crossOrigin.json(), {
    error: "Запрос отклонён: неверный источник",
  });
});

test("rejects a disguised upload before it reaches storage", async () => {
  const worker = await loadWorker();
  const form = new FormData();
  form.set("action", "uploadImage");
  form.set("projectId", "45ee1bd6-9f6e-41f8-9078-5ddf424f9183");
  form.set(
    "file",
    new File(["not a jpeg"], "case.jpg", { type: "image/jpeg" }),
  );

  const response = await worker.fetch(
    new Request("https://example.test/api/portfolio-media", {
      method: "POST",
      headers: {
        "oai-authenticated-user-email": "koryaginstudio@gmail.com",
        origin: "https://example.test",
        "sec-fetch-site": "same-origin",
      },
      body: form,
    }),
    { ...runtimeEnv, SUPABASE_SERVICE_ROLE_KEY: "test-only-key" },
    runtimeContext,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Содержимое файла не соответствует заявленному формату изображения",
  });
});

test("accepts the site's real WebP and JPEG files", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/rest/v1/project_images?select=")) {
      return Response.json([]);
    }
    if (url.includes("/storage/v1/object/portfolio/") && init.method === "POST") {
      return new Response("", { status: 200 });
    }
    if (url.endsWith("/rest/v1/project_images") && init.method === "POST") {
      const payload = JSON.parse(String(init.body));
      return Response.json([
        {
          id: "7381fa2a-f50c-4610-a05a-268a0d7efd4a",
          ...payload,
        },
      ]);
    }
    throw new Error(`Unexpected test request: ${url}`);
  };

  try {
    for (const [path, type] of [
      ["public/assets/images/case-gsm-store.webp", "image/webp"],
      ["public/assets/images/why-us-1.jpg", "image/jpeg"],
    ]) {
      const form = new FormData();
      form.set("action", "uploadImage");
      form.set("projectId", "45ee1bd6-9f6e-41f8-9078-5ddf424f9183");
      form.set("file", new File([await readFile(path)], path, { type }));

      const response = await worker.fetch(
        new Request("https://example.test/api/portfolio-media", {
          method: "POST",
          headers: {
            "oai-authenticated-user-email": "koryaginstudio@gmail.com",
            origin: "https://example.test",
            "sec-fetch-site": "same-origin",
          },
          body: form,
        }),
        { ...runtimeEnv, SUPABASE_SERVICE_ROLE_KEY: "test-only-key" },
        runtimeContext,
      );

      assert.equal(response.status, 200, path);
      const result = await response.json();
      assert.equal(result.image.project_id, "45ee1bd6-9f6e-41f8-9078-5ddf424f9183");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
