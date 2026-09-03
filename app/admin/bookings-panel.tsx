"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

type Booking = {
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
  eventUrl?: string;
  meetUrl?: string;
};

type Filter = "upcoming" | "all" | BookingStatus;

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  completed: "Завершена",
  no_show: "Не пришёл",
};

export function BookingsPanel({ onToast }: { onToast: (message: string) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calendarWarning, setCalendarWarning] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin-bookings", { cache: "no-store", credentials: "same-origin" });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить записи");
      setBookings(result.bookings ?? []);
      setCalendarWarning(result.calendarWarning ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить записи");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the protected booking API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const today = moscowToday();
  const visible = useMemo(() => {
    const result = bookings.filter((booking) => {
      if (filter === "all") return true;
      if (filter === "upcoming") return booking.status === "confirmed" && booking.booking_date >= today;
      return booking.status === filter;
    });
    return result.sort((a, b) => {
      const direction = filter === "upcoming" ? 1 : -1;
      return direction * `${a.booking_date}T${a.booking_time}`.localeCompare(`${b.booking_date}T${b.booking_time}`);
    });
  }, [bookings, filter, today]);

  const upcoming = bookings.filter((booking) => booking.status === "confirmed" && booking.booking_date >= today).length;
  const todayCount = bookings.filter((booking) => booking.status === "confirmed" && booking.booking_date === today).length;
  const completed = bookings.filter((booking) => booking.status === "completed").length;

  async function command(booking: Booking, body: Record<string, unknown>, success: string) {
    setBusyId(booking.id);
    try {
      const response = await fetch("/api/admin-bookings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id, ...body }),
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || "Операция не выполнена");
      await load();
      onToast(success);
      setEditing(null);
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "Операция не выполнена");
    } finally {
      setBusyId("");
    }
  }

  function cancel(booking: Booking) {
    if (!window.confirm(`Отменить консультацию с ${booking.name}? Событие будет удалено из Google Calendar.`)) return;
    void command(booking, { action: "cancel" }, "Запись отменена и удалена из календаря");
  }

  if (loading && !bookings.length) return <BookingLoading />;
  if (error && !bookings.length) {
    return <div className="booking-admin-empty"><h2>Записи не загрузились</h2><p>{error}</p><button onClick={() => void load()}>Попробовать снова</button></div>;
  }

  return (
    <section className="booking-admin">
      <div className="admin-stats booking-admin-stats">
        <BookingStat label="Предстоящие" value={upcoming} accent />
        <BookingStat label="Сегодня" value={todayCount} />
        <BookingStat label="Завершены" value={completed} />
        <BookingStat label="Всего записей" value={bookings.length} />
      </div>

      <div className="booking-admin-toolbar">
        <div className="admin-segmented" aria-label="Фильтр записей">
          {(["upcoming", "confirmed", "completed", "no_show", "cancelled", "all"] as Filter[]).map((item) => (
            <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
              {item === "upcoming" ? "Предстоящие" : item === "all" ? "Все" : STATUS_LABELS[item as BookingStatus]}
            </button>
          ))}
        </div>
        <button className="booking-admin-refresh" onClick={() => void load()} disabled={loading}>Обновить</button>
      </div>

      {calendarWarning && <div className="booking-admin-warning">Записи загружены, но ссылки Google недоступны: {calendarWarning}</div>}

      {visible.length ? (
        <div className="booking-admin-list">
          {visible.map((booking) => (
            <article className="booking-admin-card" key={booking.id}>
              <div className="booking-admin-date">
                <span>{formatWeekday(booking.booking_date)}</span>
                <strong>{formatDay(booking.booking_date)}</strong>
                <b>{booking.booking_time}</b>
              </div>
              <div className="booking-admin-person">
                <span className={`booking-admin-status is-${booking.status}`}>{STATUS_LABELS[booking.status]}</span>
                <h2>{booking.name}</h2>
                <a href={contactHref(booking.contact)}>{booking.contact}</a>
                <small>{booking.source} · {(booking.locale || "—").toUpperCase()} / {booking.country || "—"}</small>
              </div>
              <div className="booking-admin-links">
                {booking.meetUrl && <a href={booking.meetUrl} target="_blank" rel="noreferrer">Google Meet ↗</a>}
                {booking.eventUrl && <a href={booking.eventUrl} target="_blank" rel="noreferrer">В календаре ↗</a>}
              </div>
              <div className="booking-admin-actions">
                <button onClick={() => setEditing(booking)} disabled={busyId === booking.id}>Перенести</button>
                {booking.status === "confirmed" && (
                  <>
                    <button onClick={() => void command(booking, { action: "setStatus", status: "completed" }, "Консультация отмечена завершённой")}>Завершена</button>
                    <button onClick={() => void command(booking, { action: "setStatus", status: "no_show" }, "Отмечено: клиент не пришёл")}>Не пришёл</button>
                    <button className="is-danger" onClick={() => cancel(booking)}>Отменить</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="booking-admin-empty"><h2>Здесь пока пусто</h2><p>Для выбранного фильтра записей нет.</p></div>}

      {editing && (
        <RescheduleDialog
          booking={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={(date, time) => command(editing, { action: "reschedule", date, time }, "Запись перенесена, Google Calendar обновлён")}
        />
      )}
    </section>
  );
}

function RescheduleDialog({ booking, busy, onClose, onSave }: { booking: Booking; busy: boolean; onClose: () => void; onSave: (date: string, time: string) => Promise<void> }) {
  const [date, setDate] = useState(booking.booking_date);
  const [time, setTime] = useState(booking.booking_time);
  const dates = dateLimits();
  return (
    <div className="booking-admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="booking-admin-modal" role="dialog" aria-modal="true" aria-labelledby="reschedule-title">
        <span>ПЕРЕНОС КОНСУЛЬТАЦИИ</span>
        <h2 id="reschedule-title">{booking.name}</h2>
        <p>Событие и ссылка Google Meet сохранятся. Новое время займёт 30 минут звонка и 30 минут резерва.</p>
        <label>Дата<input type="date" min={dates.min} max={dates.max} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Время<select value={time} onChange={(event) => setTime(event.target.value)}>{timeOptions().map((item) => <option key={item}>{item}</option>)}</select></label>
        <div><button className="admin-secondary-button" onClick={onClose} disabled={busy}>Закрыть</button><button className="admin-primary-button" onClick={() => void onSave(date, time)} disabled={busy}>{busy ? "Переношу..." : "Перенести"}</button></div>
      </section>
    </div>
  );
}

function BookingStat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`admin-stat ${accent ? "is-accent" : ""}`}><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong></div>;
}

function BookingLoading() {
  return <div className="admin-loading">{Array.from({ length: 4 }).map((_, index) => <span key={index} />)}</div>;
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("Сервер вернул некорректный ответ");
  return text ? JSON.parse(text) : {};
}

function moscowToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" }).format(new Date(`${date}T12:00:00+03:00`)).replace(".", "");
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", timeZone: "Europe/Moscow" }).format(new Date(`${date}T12:00:00+03:00`)).replace(".", "");
}

function dateLimits() {
  const minDate = new Date(Date.now() + 4 * 60 * 60_000);
  const maxDate = new Date(Date.now() + 30 * 86_400_000);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });
  return { min: formatter.format(minDate), max: formatter.format(maxDate) };
}

function timeOptions() {
  const values: string[] = [];
  for (let minute = 600; minute <= 1230; minute += 30) values.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  return values;
}

function contactHref(contact: string) {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return `mailto:${contact}`;
  if (contact.startsWith("@")) return `https://t.me/${contact.slice(1)}`;
  return `tel:${contact.replace(/[^+\d]/g, "")}`;
}
