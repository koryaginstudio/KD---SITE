const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MOSCOW_TIME_ZONE = "Europe/Moscow";
const BOOKING_BLOCK_MINUTES = 60;

export interface GoogleCalendarEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_CALENDAR_ID?: string;
}

export type CalendarBooking = {
  submissionKey: string;
  bookingId: string;
  date: string;
  time: string;
  name: string;
  contact: string;
  source: string;
};

export type CalendarEventResult = {
  eventId: string;
  eventUrl?: string;
  meetUrl?: string;
};

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: "not_configured" | "authorization_failed" | "request_failed",
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export async function calendarSlotIsBusy(
  env: GoogleCalendarEnv,
  date: string,
  time: string,
) {
  const { start, end } = bookingInterval(date, time);
  const busy = await calendarBusyIntervals(env, start, end);
  return busy.length > 0;
}

export async function calendarUnavailableSlots(
  env: GoogleCalendarEnv,
  date: string,
) {
  const rangeStart = `${date}T10:00:00+03:00`;
  const rangeEnd = `${date}T21:30:00+03:00`;
  const busy = await calendarBusyIntervals(env, rangeStart, rangeEnd);
  const unavailable: string[] = [];
  for (let minute = 10 * 60; minute < 21 * 60; minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const interval = bookingInterval(date, time);
    const startMs = Date.parse(interval.start);
    const endMs = Date.parse(interval.end);
    if (busy.some((item) => Date.parse(item.start) < endMs && Date.parse(item.end) > startMs)) {
      unavailable.push(time);
    }
  }
  return unavailable;
}

async function calendarBusyIntervals(
  env: GoogleCalendarEnv,
  start: string,
  end: string,
) {
  const calendarId = configuredCalendarId(env);
  const accessToken = await googleAccessToken(env);
  const response = await googleRequest(
    `${GOOGLE_CALENDAR_API}/freeBusy`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: start,
        timeMax: end,
        timeZone: MOSCOW_TIME_ZONE,
        items: [{ id: calendarId }],
      }),
    },
  );
  const result = await response.json() as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }>;
  };
  const calendars = result.calendars ?? {};
  const calendar = calendars[calendarId] ?? Object.values(calendars)[0];
  if (!calendar || calendar.errors?.length) {
    throw new GoogleCalendarError("request_failed", "Google Calendar did not return availability");
  }
  return calendar.busy ?? [];
}

export async function createCalendarBooking(
  env: GoogleCalendarEnv,
  booking: CalendarBooking,
): Promise<CalendarEventResult> {
  const calendarId = configuredCalendarId(env);
  const accessToken = await googleAccessToken(env);
  const eventId = await stableEventId(booking.submissionKey);
  const existing = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (existing.ok) return calendarEventResult(await existing.json());
  if (existing.status !== 404 && existing.status !== 410) {
    await throwGoogleError(existing, "Could not check an existing calendar event");
  }

  const { start, end } = bookingInterval(booking.date, booking.time);
  const response = await googleRequest(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        id: eventId,
        summary: `Консультация - ${booking.name}`,
        description: [
          `Клиент: ${booking.name}`,
          `Контакт: ${booking.contact}`,
          `Источник: ${booking.source}`,
          `ID записи: ${booking.bookingId}`,
          "",
          "Первые 30 минут - консультация, следующие 30 минут - резерв между звонками.",
        ].join("\n"),
        start: { dateTime: start, timeZone: MOSCOW_TIME_ZONE },
        end: { dateTime: end, timeZone: MOSCOW_TIME_ZONE },
        conferenceData: {
          createRequest: {
            requestId: `kd-${booking.bookingId}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        extendedProperties: {
          private: {
            kdBookingId: booking.bookingId,
            kdSubmissionKey: booking.submissionKey,
          },
        },
      }),
    },
  );
  return calendarEventResult(await response.json());
}

function configuredCalendarId(env: GoogleCalendarEnv) {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    throw new GoogleCalendarError("not_configured", "GOOGLE_CALENDAR_ID is missing");
  }
  return calendarId;
}

async function googleAccessToken(env: GoogleCalendarEnv) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleCalendarError("not_configured", "Google OAuth secrets are missing");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new GoogleCalendarError(
      "authorization_failed",
      `Google OAuth ${response.status}: ${details.slice(0, 240)}`,
    );
  }
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) {
    throw new GoogleCalendarError("authorization_failed", "Google OAuth returned no access token");
  }
  return result.access_token;
}

async function googleRequest(url: string, accessToken: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) await throwGoogleError(response, "Google Calendar request failed");
  return response;
}

async function throwGoogleError(response: Response, fallback: string): Promise<never> {
  const details = await response.text();
  throw new GoogleCalendarError(
    response.status === 401 || response.status === 403
      ? "authorization_failed"
      : "request_failed",
    `${fallback} (${response.status}): ${details.slice(0, 300)}`,
  );
}

function bookingInterval(date: string, time: string) {
  const start = `${date}T${time}:00+03:00`;
  const startUtc = Date.parse(start);
  const end = new Date(startUtc + BOOKING_BLOCK_MINUTES * 60_000)
    .toISOString()
    .replace("Z", "+00:00");
  return { start, end };
}

async function stableEventId(submissionKey: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`koryagin-design:${submissionKey}`),
  );
  return `kd${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48)}`;
}

function calendarEventResult(value: unknown): CalendarEventResult {
  const event = value as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  if (!event.id) {
    throw new GoogleCalendarError("request_failed", "Google Calendar returned an invalid event");
  }
  const meetUrl = event.hangoutLink || event.conferenceData?.entryPoints
    ?.find((entry) => entry.entryPointType === "video")?.uri;
  return { eventId: event.id, eventUrl: event.htmlLink, meetUrl };
}
