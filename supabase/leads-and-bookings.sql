-- Secure lead, quiz and consultation storage for koryagindesign.com.
-- Run once in Supabase SQL Editor before enabling the public endpoints.

create extension if not exists pgcrypto;

create table if not exists public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  name text not null,
  contact text not null,
  booking_date date not null,
  booking_time time without time zone not null,
  timezone text not null default 'Europe/Moscow',
  source text not null default 'booking-widget',
  locale text not null check (locale in ('ru', 'en')),
  country text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists consultation_bookings_active_slot_idx
  on public.consultation_bookings (booking_date, booking_time)
  where status = 'confirmed';

create table if not exists public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  kind text not null check (kind in ('contact', 'quiz', 'booking')),
  name text not null,
  contact text not null,
  business text,
  comment text,
  service_id text,
  service_name text,
  budget text,
  message text,
  source text not null,
  quiz_version text,
  result_score jsonb,
  answers jsonb,
  page_url text,
  referrer text,
  user_agent text,
  utm jsonb,
  booking_id uuid references public.consultation_bookings(id),
  locale text not null check (locale in ('ru', 'en')),
  country text,
  consent_obtained_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead_submissions(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'bitrix')),
  recipient text not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, channel, recipient)
);

alter table public.consultation_bookings enable row level security;
alter table public.lead_submissions enable row level security;
alter table public.lead_deliveries enable row level security;

-- No anon/authenticated policies are created. Only the server-side service role
-- can read or write personal data.

create or replace function public.submit_lead(
  p_submission_key uuid,
  p_payload jsonb
)
returns table (lead_id uuid, booking_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  inserted_id uuid;
begin
  insert into public.lead_submissions (
    submission_key, kind, name, contact, business, comment, service_id,
    service_name, budget, message, source, quiz_version, result_score,
    answers, page_url, referrer, user_agent, utm, locale, country
  ) values (
    p_submission_key,
    coalesce(p_payload->>'kind', 'contact'),
    p_payload->>'name',
    p_payload->>'contact',
    p_payload->>'business',
    p_payload->>'comment',
    p_payload->>'serviceId',
    p_payload->>'serviceName',
    p_payload->>'budget',
    p_payload->>'message',
    p_payload->>'source',
    p_payload->>'quizVersion',
    p_payload->'resultScore',
    p_payload->'answers',
    p_payload->>'pageUrl',
    p_payload->>'referrer',
    p_payload->>'userAgent',
    p_payload->'utm',
    p_payload->>'locale',
    p_payload->>'country'
  )
  on conflict (submission_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select ls.id into existing_id
    from public.lead_submissions as ls
    where ls.submission_key = p_submission_key;
    return query select existing_id, null::uuid, true;
    return;
  end if;

  return query select inserted_id, null::uuid, false;
end;
$$;

create or replace function public.submit_consultation_booking(
  p_submission_key uuid,
  p_payload jsonb
)
returns table (lead_id uuid, booking_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lead_id uuid;
  existing_booking_id uuid;
  inserted_booking_id uuid;
  inserted_lead_id uuid;
begin
  select ls.id, ls.booking_id
    into existing_lead_id, existing_booking_id
  from public.lead_submissions as ls
  where ls.submission_key = p_submission_key;

  if existing_lead_id is not null then
    return query select existing_lead_id, existing_booking_id, true;
    return;
  end if;

  begin
    insert into public.consultation_bookings (
      submission_key, name, contact, booking_date, booking_time, timezone,
      source, locale, country
    ) values (
      p_submission_key,
      p_payload->>'name',
      p_payload->>'contact',
      (p_payload->>'bookingDate')::date,
      (p_payload->>'bookingTime')::time,
      coalesce(p_payload->>'timezone', 'Europe/Moscow'),
      p_payload->>'source',
      p_payload->>'locale',
      p_payload->>'country'
    ) returning id into inserted_booking_id;
  exception when unique_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  insert into public.lead_submissions (
    submission_key, kind, name, contact, source, booking_id, locale, country
  ) values (
    p_submission_key,
    'booking',
    p_payload->>'name',
    p_payload->>'contact',
    p_payload->>'source',
    inserted_booking_id,
    p_payload->>'locale',
    p_payload->>'country'
  ) returning id into inserted_lead_id;

  return query select inserted_lead_id, inserted_booking_id, false;
end;
$$;

revoke all on function public.submit_lead(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_consultation_booking(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_lead(uuid, jsonb) to service_role;
grant execute on function public.submit_consultation_booking(uuid, jsonb) to service_role;

revoke all on public.lead_submissions from anon, authenticated;
revoke all on public.consultation_bookings from anon, authenticated;
revoke all on public.lead_deliveries from anon, authenticated;

-- The Worker writes delivery attempts directly after the lead RPC succeeds.
-- Keep personal data closed to public roles while allowing the server role to
-- create and update Telegram/Bitrix delivery status records.
grant usage on schema public to service_role;
grant select, insert, update on public.lead_deliveries to service_role;
