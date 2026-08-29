begin;

create table if not exists public.project_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  name_en text,
  sort integer not null default 0 check (sort >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_types_active_sort_idx
  on public.project_types (active, sort);

insert into public.project_types (slug, name, name_en, sort, active)
values
  ('identity', 'Айдентика', 'Visual Identity', 1, true),
  ('branding', 'Брендинг', 'Branding', 2, true),
  ('logo', 'Логотип', 'Logo Design', 3, true),
  ('other', 'Прочее', 'Other', 4, true)
on conflict (slug) do nothing;

alter table public.projects
  add column if not exists project_type_id uuid;

alter table public.projects
  add column if not exists in_portfolio boolean not null default true;

alter table public.projects
  add column if not exists title_en text,
  add column if not exists category_en text,
  add column if not exists service_en text,
  add column if not exists task_en text,
  add column if not exists solution_en text,
  add column if not exists summary_en text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_project_type_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_project_type_id_fkey
      foreign key (project_type_id)
      references public.project_types(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists projects_project_type_idx
  on public.projects (project_type_id);

create index if not exists projects_portfolio_sort_idx
  on public.projects (published, in_portfolio, sort);

update public.projects as p
set project_type_id = t.id
from public.project_types as t
where p.project_type_id is null
  and lower(p.service) = lower(t.name);

create or replace function public.sync_project_service_from_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_type_id is not null then
    select name, name_en
    into new.service, new.service_en
    from public.project_types
    where id = new.project_type_id;
  end if;

  return new;
end;
$$;

create or replace function public.sync_projects_after_type_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name
     or new.name_en is distinct from old.name_en then
    update public.projects
    set service = new.name,
        service_en = new.name_en
    where project_type_id = new.id;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'projects_sync_service_from_type'
      and tgrelid = 'public.projects'::regclass
  ) then
    create trigger projects_sync_service_from_type
    before insert or update of project_type_id
    on public.projects
    for each row execute function public.sync_project_service_from_type();
  end if;

  drop trigger if exists project_types_sync_service_name on public.project_types;
  create trigger project_types_sync_service_name
  after update of name, name_en
  on public.project_types
  for each row execute function public.sync_projects_after_type_rename();

  if not exists (
    select 1 from pg_trigger
    where tgname = 'project_types_set_updated_at'
      and tgrelid = 'public.project_types'::regclass
  ) then
    create trigger project_types_set_updated_at
    before update on public.project_types
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  alt text not null default '',
  is_cover boolean not null default false,
  sort integer not null default 0 check (sort >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, url)
);

create index if not exists project_images_project_sort_idx
  on public.project_images (project_id, sort, created_at);

create unique index if not exists project_images_one_cover_idx
  on public.project_images (project_id)
  where is_cover;

create or replace function public.validate_project_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_count integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into image_count
    from public.project_images
    where project_id = new.project_id;

    if image_count >= 4 then
      raise exception 'У проекта может быть не более 4 изображений';
    end if;
  elsif new.project_id is distinct from old.project_id then
    select count(*) into image_count
    from public.project_images
    where project_id = new.project_id;

    if image_count >= 4 then
      raise exception 'У проекта может быть не более 4 изображений';
    end if;
  end if;

  if new.is_cover then
    update public.project_images
    set is_cover = false
    where project_id = new.project_id
      and id <> new.id
      and is_cover;
  elsif not exists (
    select 1
    from public.project_images
    where project_id = new.project_id
      and id <> new.id
      and is_cover
  ) then
    new.is_cover := true;
  end if;

  return new;
end;
$$;

create or replace function public.refresh_project_media(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gallery text[];
begin
  if not exists (
    select 1
    from public.project_images
    where project_id = p_project_id
      and is_cover
  ) then
    update public.project_images
    set is_cover = true
    where id = (
      select id
      from public.project_images
      where project_id = p_project_id
      order by sort, created_at, id
      limit 1
    );
  end if;

  select array_agg(url order by is_cover desc, sort, created_at, id)
  into gallery
  from public.project_images
  where project_id = p_project_id;

  update public.projects
  set cover = coalesce(gallery[1], ''),
      images = coalesce(gallery, array[]::text[])
  where id = p_project_id;
end;
$$;

create or replace function public.sync_project_media_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_project_media(old.project_id);
    return old;
  end if;

  perform public.refresh_project_media(new.project_id);

  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    perform public.refresh_project_media(old.project_id);
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'project_images_validate'
      and tgrelid = 'public.project_images'::regclass
  ) then
    create trigger project_images_validate
    before insert or update
    on public.project_images
    for each row execute function public.validate_project_image();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'project_images_sync_parent'
      and tgrelid = 'public.project_images'::regclass
  ) then
    create trigger project_images_sync_parent
    after insert or update or delete
    on public.project_images
    for each row execute function public.sync_project_media_after_change();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'project_images_set_updated_at'
      and tgrelid = 'public.project_images'::regclass
  ) then
    create trigger project_images_set_updated_at
    before update on public.project_images
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

insert into public.project_images (
  project_id,
  url,
  alt,
  is_cover,
  sort
)
select
  id,
  cover,
  title,
  true,
  0
from public.projects
where cover <> ''
on conflict (project_id, url) do nothing;

alter table public.project_types enable row level security;
alter table public.project_images enable row level security;
alter table public.projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'Public can read published projects'
  ) then
    create policy "Public can read published projects"
    on public.projects
    for select
    to anon, authenticated
    using (published = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_types'
      and policyname = 'Public can read active project types'
  ) then
    create policy "Public can read active project types"
    on public.project_types
    for select
    to anon, authenticated
    using (active = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_images'
      and policyname = 'Public can read published project images'
  ) then
    create policy "Public can read published project images"
    on public.project_images
    for select
    to anon, authenticated
    using (
      exists (
        select 1
        from public.projects
        where projects.id = project_images.project_id
          and projects.published = true
      )
    );
  end if;
end;
$$;

grant select on table public.project_types to anon, authenticated;
grant select on table public.project_images to anon, authenticated;
grant select on table public.projects to anon, authenticated;

commit;
