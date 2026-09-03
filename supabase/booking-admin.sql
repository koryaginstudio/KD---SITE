-- Run once in Supabase SQL Editor before deploying the booking admin UI.
create or replace function public.admin_set_consultation_status(
  p_booking_id uuid,
  p_status text
)
returns setof public.consultation_bookings
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('confirmed', 'cancelled', 'completed', 'no_show') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  return query
    update public.consultation_bookings
       set status = p_status,
           updated_at = now()
     where id = p_booking_id
     returning *;
end;
$$;

create or replace function public.admin_reschedule_consultation_booking(
  p_booking_id uuid,
  p_date date,
  p_time time without time zone
)
returns setof public.consultation_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  current_booking public.consultation_bookings%rowtype;
begin
  select * into current_booking
    from public.consultation_bookings
   where id = p_booking_id
   for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;

  -- The date lock keeps the five-per-day and overlap checks atomic.
  perform pg_advisory_xact_lock(hashtext(p_date::text));
  if (
    select count(*) >= 5
      from public.consultation_bookings cb
     where cb.booking_date = p_date
       and cb.status = 'confirmed'
       and cb.id <> p_booking_id
  ) then
    raise exception 'daily_limit_reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.consultation_bookings cb
     where cb.booking_date = p_date
       and cb.status = 'confirmed'
       and cb.id <> p_booking_id
       and cb.booking_time < p_time + interval '60 minutes'
       and cb.booking_time + interval '60 minutes' > p_time
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  return query
    update public.consultation_bookings
       set booking_date = p_date,
           booking_time = p_time,
           status = 'confirmed',
           updated_at = now()
     where id = p_booking_id
     returning *;
end;
$$;

revoke all on function public.admin_set_consultation_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reschedule_consultation_booking(uuid, date, time without time zone) from public, anon, authenticated;
grant execute on function public.admin_set_consultation_status(uuid, text) to service_role;
grant execute on function public.admin_reschedule_consultation_booking(uuid, date, time without time zone) to service_role;
grant select, update on public.consultation_bookings to service_role;
