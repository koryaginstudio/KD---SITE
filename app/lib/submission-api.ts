import { requestLocale } from "../i18n/locale";
import { rejectCrossOriginMutation } from "./request-security";
import { rest } from "./supabase-admin";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ANSWERS = 24;
const TELEGRAM_MESSAGE_LIMIT = 3900;
const BOOKING_START_HOUR = 10;
const BOOKING_END_HOUR = 21;
const BOOKING_STEP_MINUTES = 30;
const BOOKING_MIN_NOTICE_MINUTES = 4 * 60;
const BOOKING_MAX_DAYS_AHEAD = 30;

export interface SubmissionEnv {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_RECIPIENT_CHAT_IDS?: string;
}

export interface SubmissionContext {
  waitUntil(promise: Promise<unknown>): void;
}

type QuizAnswer = {
  questionId: string;
  questionTitle: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
};

type SubmissionPayload = {
  kind: "contact" | "quiz" | "booking";
  name: string;
  contact: string;
  business?: string;
  comment?: string;
  serviceId?: string;
  serviceName?: string;
  budget?: string;
  message?: string;
  source: string;
  quizVersion?: string;
  resultScore?: Record<string, number>;
  answers?: QuizAnswer[];
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  utm?: Record<string, string>;
  bookingDate?: string;
  bookingTime?: string;
  timezone?: string;
  locale: "ru" | "en";
  country?: string;
};

type StoredSubmission = {
  lead_id: string;
  booking_id: string | null;
  duplicate: boolean;
};

export async function handleSubmissionRequest(
  request: Request,
  env: SubmissionEnv,
  ctx: SubmissionContext,
  pathname: "/api/leads" | "/api/bookings",
) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "POST, OPTIONS" },
    });
  }

  if (request.method !== "POST") {
    return submissionJson(
      { ok: false, error: "method_not_allowed" },
      405,
      { Allow: "POST, OPTIONS" },
    );
  }

  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return submissionJson({ ok: false, error: "storage_not_configured" }, 503);
  }

  try {
    const rawPayload = await readJsonBody(request);
    const payload = pathname === "/api/bookings"
      ? normalizeBooking(rawPayload, request)
      : normalizeLead(rawPayload, request);
    const submissionKey = normalizeSubmissionKey(
      request.headers.get("x-submission-key"),
    );

    const rows = await rest<StoredSubmission[]>(
      pathname === "/api/bookings"
        ? "rpc/submit_consultation_booking"
        : "rpc/submit_lead",
      {
        method: "POST",
        body: JSON.stringify({
          p_submission_key: submissionKey,
          p_payload: payload,
        }),
      },
      undefined,
      serviceKey,
    );
    const stored = rows[0];
    if (!stored?.lead_id) throw new Error("submission_not_stored");

    if (!stored.duplicate) {
      const delivery = deliverTelegramNotification(
        stored.lead_id,
        payload,
        env,
        serviceKey,
      ).catch((error) => {
        console.error("Telegram delivery failed", {
          leadId: stored.lead_id,
          message: safeErrorMessage(error),
        });
      });
      ctx.waitUntil(delivery);
    }

    return submissionJson(
      {
        ok: true,
        leadId: stored.lead_id,
        bookingId: stored.booking_id,
        duplicate: stored.duplicate,
      },
      stored.duplicate ? 200 : 201,
    );
  } catch (error) {
    const message = safeErrorMessage(error);
    if (message.includes("slot_unavailable")) {
      return submissionJson({ ok: false, error: "slot_unavailable" }, 409);
    }
    if (message.includes("daily_limit_reached")) {
      return submissionJson({ ok: false, error: "daily_limit_reached" }, 409);
    }
    if (error instanceof SubmissionValidationError) {
      return submissionJson(
        { ok: false, error: error.code, field: error.field },
        400,
      );
    }
    console.error("Submission failed", { pathname, message });
    return submissionJson({ ok: false, error: "submission_failed" }, 500);
  }
}

async function readJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new SubmissionValidationError("invalid_content_type");
  }

  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_BODY_BYTES) {
    throw new SubmissionValidationError("payload_too_large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new SubmissionValidationError("payload_too_large");
  }

  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value)) return value[0];
    return value;
  } catch {
    throw new SubmissionValidationError("invalid_json");
  }
}

function normalizeLead(value: unknown, request: Request): SubmissionPayload {
  const input = record(value);
  const isQuiz = Array.isArray(input.answers) || recordOrNull(input.result);
  const contact = recordOrNull(input.contact);
  const result = recordOrNull(input.result);
  const page = recordOrNull(input.page);

  if (isQuiz) {
    const answers = array(input.answers).slice(0, MAX_ANSWERS).map((answer) => {
      const item = record(answer);
      return {
        questionId: text(item.questionId, "answers.questionId", 80),
        questionTitle: text(item.questionTitle, "answers.questionTitle", 300),
        selectedOptionId: text(item.selectedOptionId, "answers.selectedOptionId", 80),
        selectedOptionLabel: text(
          item.selectedOptionLabel,
          "answers.selectedOptionLabel",
          300,
        ),
      };
    });
    if (!answers.length) {
      throw new SubmissionValidationError("required", "answers");
    }

    return withRequestContext({
      kind: "quiz",
      name: text(contact?.name, "name", 120),
      contact: text(contact?.contact, "contact", 240),
      business: optionalText(contact?.business, 300),
      comment: optionalText(contact?.comment, 2000),
      serviceId: optionalText(result?.serviceId, 100),
      serviceName: optionalText(result?.serviceName, 200),
      source: optionalText(input.source, 120) || "quiz",
      quizVersion: optionalText(input.quizVersion, 120),
      resultScore: numberRecord(result?.score),
      answers,
      pageUrl: optionalText(page?.url, 1000),
      referrer: optionalText(page?.referrer, 1000),
      userAgent: optionalText(page?.userAgent, 500),
      utm: stringRecord(input.utm, 20, 300),
    }, request);
  }

  return withRequestContext({
    kind: "contact",
    name: text(input.name, "name", 120),
    contact: text(input.contact, "contact", 240),
    serviceName: optionalText(input.service, 200),
    budget: optionalText(input.budget, 300),
    message: optionalText(input.message, 2000),
    source: optionalText(input.source, 120) || "site",
    pageUrl: optionalText(input.page_url, 1000),
  }, request);
}

function normalizeBooking(value: unknown, request: Request): SubmissionPayload {
  const input = record(value);
  const bookingDate = text(input.booking_date, "booking_date", 10);
  const bookingTime = text(input.booking_time, "booking_time", 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    throw new SubmissionValidationError("invalid_date", "booking_date");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(bookingTime)) {
    throw new SubmissionValidationError("invalid_time", "booking_time");
  }
  const [hours, minutes] = bookingTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  if (
    minutes % BOOKING_STEP_MINUTES !== 0 ||
    totalMinutes < BOOKING_START_HOUR * 60 ||
    totalMinutes >= BOOKING_END_HOUR * 60
  ) {
    throw new SubmissionValidationError("time_outside_schedule", "booking_time");
  }
  const [year, month, day] = bookingDate.split("-").map(Number);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (normalizedDate !== bookingDate) {
    throw new SubmissionValidationError("invalid_date", "booking_date");
  }
  const bookingAt = Date.UTC(year, month - 1, day, hours - 3, minutes);
  if (!Number.isFinite(bookingAt)) {
    throw new SubmissionValidationError("invalid_date", "booking_date");
  }
  const noticeMinutes = (bookingAt - Date.now()) / 60_000;
  if (noticeMinutes < BOOKING_MIN_NOTICE_MINUTES) {
    throw new SubmissionValidationError("booking_too_soon", "booking_date");
  }
  const latestBookingAt = Date.now() + BOOKING_MAX_DAYS_AHEAD * 86_400_000;
  if (bookingAt > latestBookingAt) {
    throw new SubmissionValidationError("booking_too_far", "booking_date");
  }

  return withRequestContext({
    kind: "booking",
    name: text(input.name, "name", 120),
    contact: text(input.contact, "contact", 240),
    source: optionalText(input.source, 120) || "booking-widget",
    bookingDate,
    bookingTime,
    timezone: "Europe/Moscow",
  }, request);
}

function withRequestContext(
  payload: Omit<SubmissionPayload, "locale" | "country">,
  request: Request,
): SubmissionPayload {
  return {
    ...payload,
    locale: requestLocale(request),
    country: optionalText(request.headers.get("cf-ipcountry"), 2)?.toUpperCase(),
  };
}

async function deliverTelegramNotification(
  leadId: string,
  payload: SubmissionPayload,
  env: SubmissionEnv,
  serviceKey: string,
) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const recipients = parseRecipients(env.TELEGRAM_RECIPIENT_CHAT_IDS);
  if (!token || !recipients.length) return;

  const message = telegramMessage(leadId, payload);
  await Promise.all(recipients.map(async (recipient) => {
    const inserted = await rest<Array<{ id: string; status: string }>>(
      "lead_deliveries?on_conflict=lead_id,channel,recipient",
      {
        method: "POST",
        body: JSON.stringify({
          lead_id: leadId,
          channel: "telegram",
          recipient,
          status: "pending",
          attempts: 0,
        }),
      },
      "resolution=ignore-duplicates,return=representation",
      serviceKey,
    );
    if (!inserted.length) return;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: recipient,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
      );
      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(`Telegram HTTP ${response.status}: ${responseBody.slice(0, 240)}`);
      }
      await updateDelivery(leadId, recipient, "delivered", null, serviceKey);
    } catch (error) {
      await updateDelivery(
        leadId,
        recipient,
        "failed",
        safeErrorMessage(error).slice(0, 500),
        serviceKey,
      );
      throw error;
    }
  }));
}

async function updateDelivery(
  leadId: string,
  recipient: string,
  status: "delivered" | "failed",
  lastError: string | null,
  serviceKey: string,
) {
  const query = new URLSearchParams({
    lead_id: `eq.${leadId}`,
    channel: "eq.telegram",
    recipient: `eq.${recipient}`,
  });
  await rest(
    `lead_deliveries?${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
        attempts: 1,
        last_error: lastError,
        delivered_at: status === "delivered" ? new Date().toISOString() : null,
      }),
    },
    "return=minimal",
    serviceKey,
  );
}

function telegramMessage(leadId: string, payload: SubmissionPayload) {
  const lines: string[] = [];
  if (payload.kind === "booking") {
    lines.push("🔴 <b>НОВАЯ ЗАПИСЬ НА КОНСУЛЬТАЦИЮ</b>");
  } else if (payload.kind === "quiz") {
    lines.push("🔴 <b>НОВАЯ ЗАЯВКА ИЗ КВИЗА</b>");
  } else {
    lines.push("🔴 <b>НОВАЯ ЗАЯВКА С САЙТА</b>");
  }

  lines.push(`🆔 ID: <code>${escapeHtml(leadId)}</code>`);
  lines.push(`👤 Имя: <b>${escapeHtml(payload.name)}</b>`);
  lines.push(`📲 Контакт: ${escapeHtml(payload.contact)}`);
  addLine(lines, "🏢 Бизнес", payload.business);
  addLine(lines, "🎨 Услуга", payload.serviceName || payload.serviceId);
  addLine(lines, "💰 Бюджет и сроки", payload.budget);
  addLine(lines, "📝 Комментарий", payload.comment || payload.message);

  if (payload.bookingDate && payload.bookingTime) {
    lines.push("");
    lines.push(
      `📅 <b>${escapeHtml(payload.bookingDate)}, ${escapeHtml(payload.bookingTime)} МСК (GMT+3)</b>`,
    );
  }

  if (payload.answers?.length) {
    lines.push("");
    lines.push("🧭 <b>Путь по квизу:</b>");
    payload.answers.forEach((answer, index) => {
      lines.push(
        `${index + 1}. ${escapeHtml(answer.questionTitle)}\n→ <b>${escapeHtml(answer.selectedOptionLabel)}</b>`,
      );
    });
  }

  lines.push("");
  lines.push(`📍 Источник: ${escapeHtml(payload.source)}`);
  lines.push(`🌍 Язык / страна: ${payload.locale.toUpperCase()} / ${escapeHtml(payload.country || "XX")}`);
  addLine(lines, "🔗 Страница", payload.pageUrl);
  addLine(lines, "↩️ Referrer", payload.referrer);
  if (payload.utm && Object.keys(payload.utm).length) {
    lines.push(`📊 UTM: ${escapeHtml(JSON.stringify(payload.utm))}`);
  }

  return fitTelegramLines(lines);
}

function fitTelegramLines(lines: string[]) {
  let message = "";
  for (const line of lines) {
    const candidate = message ? `${message}\n${line}` : line;
    if (candidate.length > TELEGRAM_MESSAGE_LIMIT - 24) {
      return `${message}\n…часть данных сокращена`;
    }
    message = candidate;
  }
  return message;
}

function addLine(lines: string[], label: string, value?: string) {
  if (value) lines.push(`${label}: ${escapeHtml(value)}`);
}

function parseRecipients(value: string | undefined) {
  return [...new Set(
    (value ?? "")
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter((item) => /^-?\d+$/.test(item)),
  )];
}

function normalizeSubmissionKey(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SubmissionValidationError("invalid_payload");
  }
  return value as Record<string, unknown>;
}

function recordOrNull(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, field: string, maxLength: number) {
  const normalized = optionalText(value, maxLength);
  if (!normalized) throw new SubmissionValidationError("required", field);
  return normalized;
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new SubmissionValidationError("too_long");
  }
  return normalized;
}

function numberRecord(value: unknown) {
  const input = recordOrNull(value);
  if (!input) return undefined;
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 30)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function stringRecord(value: unknown, maxEntries: number, maxLength: number) {
  const input = recordOrNull(value);
  if (!input) return undefined;
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, maxEntries)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, item]) => [key.slice(0, 80), item.slice(0, maxLength)]),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

class SubmissionValidationError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code);
  }
}

function submissionJson(
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
