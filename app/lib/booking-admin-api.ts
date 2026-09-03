import { rest } from "./supabase-admin";
import {
  calendarSlotIsBusyExcept,
  deleteCalendarBooking,
  listManagedCalendarEvents,
  updateCalendarBooking,
  type GoogleCalendarEnv,
} from "./google-calendar";

export interface BookingAdminEnv extends GoogleCalendarEnv {
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

type BookingRecord = {
  id: string;
  submission_key: string;
  name: string;
  contact: string;
  booking_date: string;
  booking_time: string;
  timezone: string;
  source: string;
  locale: string;
  country: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};

const SELECT = "id,submission_key,name,contact,booking_date,booking_time,timezone,source,locale,country,status,created_at,updated_at";

export async function handleBookingAdminRequest(request: Request, env: BookingAdminEnv) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const bookings = await rest<BookingRecord[]>(
        `consultation_bookings?select=${SELECT}&order=booking_date.desc,booking_time.desc&limit=300`,
        {},
        undefined,
        serviceKey,
      );
      let calendarWarning = "";
      const calendarByBookingId = new Map<string, { eventUrl?: string; meetUrl?: string }>();
      try {
        const now = new Date();
        const min = new Date(now.getTime() - 180 * 86_400_000).toISOString();
        const max = new Date(now.getTime() + 60 * 86_400_000).toISOString();
        const events = await listManagedCalendarEvents(env, min, max);
        for (const event of events) {
          if (event.bookingId) calendarByBookingId.set(event.bookingId, event);
        }
      } catch (error) {
        calendarWarning = error instanceof Error ? error.message : "Не удалось загрузить ссылки Google Calendar";
      }
      const body = {
        bookings: bookings.map((booking) => ({
          ...booking,
          booking_time: booking.booking_time.slice(0, 5),
          ...calendarByBookingId.get(booking.id),
        })),
        calendarWarning,
      };
      return request.method === "HEAD"
        ? new Response(null, { status: 200, headers: jsonHeaders() })
        : Response.json(body, { headers: jsonHeaders() });
    }

    if (request.method !== "POST") return errorJson("Метод не поддерживается", 405);
    const input = await request.json() as Record<string, unknown>;
    const action = String(input.action ?? "");
    const id = uuid(input.id);
    const current = await findBooking(id, serviceKey);
    if (!current) return errorJson("Запись не найдена", 404);

    if (action === "cancel") {
      await setStatus(id, "cancelled", serviceKey);
      try {
        await deleteCalendarBooking(env, current.submission_key);
      } catch (error) {
        await setStatus(id, current.status, serviceKey).catch(() => undefined);
        throw error;
      }
      return Response.json({ ok: true }, { headers: jsonHeaders() });
    }

    if (action === "setStatus") {
      const status = bookingStatus(input.status);
      if (status === "cancelled") {
        await setStatus(id, status, serviceKey);
        await deleteCalendarBooking(env, current.submission_key);
      } else {
        await setStatus(id, status, serviceKey);
      }
      return Response.json({ ok: true }, { headers: jsonHeaders() });
    }

    if (action === "reschedule") {
      const date = bookingDate(input.date);
      const time = bookingTime(input.time);
      validateBookingMoment(date, time);
      if (await calendarSlotIsBusyExcept(env, date, time, current.submission_key)) {
        return errorJson("Это время уже занято в Google Calendar", 409);
      }
      const updated = await reschedule(id, date, time, serviceKey);
      try {
        const calendar = await updateCalendarBooking(env, {
          submissionKey: updated.submission_key,
          bookingId: updated.id,
          date: updated.booking_date,
          time: updated.booking_time.slice(0, 5),
          name: updated.name,
          contact: updated.contact,
          source: updated.source,
        });
        return Response.json({ ok: true, calendar }, { headers: jsonHeaders() });
      } catch (error) {
        await reschedule(id, current.booking_date, current.booking_time.slice(0, 5), serviceKey)
          .catch(() => undefined);
        throw error;
      }
    }

    return errorJson("Неизвестная команда", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Операция не выполнена";
    const status = /slot_unavailable|daily_limit_reached/i.test(message) ? 409 : 500;
    return errorJson(
      message.includes("daily_limit_reached") ? "На этот день уже назначено пять консультаций"
        : message.includes("slot_unavailable") ? "Это время пересекается с другой консультацией"
          : message,
      status,
    );
  }
}

async function findBooking(id: string, serviceKey: string) {
  const rows = await rest<BookingRecord[]>(
    `consultation_bookings?id=eq.${id}&select=${SELECT}&limit=1`,
    {},
    undefined,
    serviceKey,
  );
  return rows[0];
}

async function setStatus(id: string, status: BookingStatus, serviceKey: string) {
  await rest(
    "rpc/admin_set_consultation_status",
    { method: "POST", body: JSON.stringify({ p_booking_id: id, p_status: status }) },
    undefined,
    serviceKey,
  );
}

async function reschedule(id: string, date: string, time: string, serviceKey: string) {
  const rows = await rest<BookingRecord[]>(
    "rpc/admin_reschedule_consultation_booking",
    { method: "POST", body: JSON.stringify({ p_booking_id: id, p_date: date, p_time: time }) },
    undefined,
    serviceKey,
  );
  if (!rows[0]) throw new Error("Supabase не вернул обновлённую запись");
  return rows[0];
}

function uuid(value: unknown) {
  const result = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error("Некорректный ID записи");
  }
  return result;
}

function bookingStatus(value: unknown): BookingStatus {
  const status = String(value ?? "") as BookingStatus;
  if (!["confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    throw new Error("Некорректный статус записи");
  }
  return status;
}

function bookingDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Некорректная дата");
  return date;
}

function bookingTime(value: unknown) {
  const time = String(value ?? "");
  if (!/^(?:1\d|20):(?:00|30)$/.test(time) || time < "10:00" || time > "20:30") {
    throw new Error("Время должно быть с 10:00 до 20:30 с шагом 30 минут");
  }
  return time;
}

function validateBookingMoment(date: string, time: string) {
  const moment = Date.parse(`${date}T${time}:00+03:00`);
  const now = Date.now();
  if (!Number.isFinite(moment) || moment < now + 4 * 60 * 60_000) {
    throw new Error("Перенести запись можно минимум за четыре часа");
  }
  if (moment > now + 30 * 86_400_000) throw new Error("Запись доступна максимум на 30 дней вперёд");
}

function errorJson(error: string, status: number) {
  return Response.json({ error }, { status, headers: jsonHeaders() });
}

function jsonHeaders() {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
}
