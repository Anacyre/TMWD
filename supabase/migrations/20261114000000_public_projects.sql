-- Public project gallery. Reads are public; every write goes through the
-- publish-project edge function (service role), which enforces the limits.

create table if not exists public.public_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  creator_name text not null check (char_length(creator_name) between 2 and 40),
  owner uuid references auth.users (id) on delete set null,
  device_id text,
  tags text[] not null default '{}' check (cardinality(tags) <= 6),
  bpm numeric,
  duration_sec numeric,
  track_count integer not null default 0,
  preview jsonb,
  size_bytes integer not null default 0 check (size_bytes <= 10485760),
  storage_path text not null,
  schema_version integer not null default 6,
  opens integer not null default 0,
  reports integer not null default 0,
  hidden boolean not null default false,
  edit_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_projects_listing on public.public_projects (hidden, created_at desc);
create index if not exists public_projects_owner on public.public_projects (owner);
create index if not exists public_projects_device on public.public_projects (device_id);

alter table public.public_projects enable row level security;

drop policy if exists "public projects are readable" on public.public_projects;
create policy "public projects are readable" on public.public_projects
  for select to anon, authenticated using (hidden = false);

-- Hide secrets from the public API even though RLS lets rows through.
revoke all on public.public_projects from anon, authenticated;
grant select (id, title, description, creator_name, owner, tags, bpm, duration_sec, track_count,
  preview, size_bytes, storage_path, schema_version, opens, created_at, updated_at)
  on public.public_projects to anon, authenticated;

create table if not exists public.public_project_reports (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.public_projects (id) on delete cascade,
  reporter_hash text not null,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (project_id, reporter_hash)
);
alter table public.public_project_reports enable row level security;
revoke all on public.public_project_reports from anon, authenticated;

create table if not exists public.publish_events (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists publish_events_recent on public.publish_events (ip_hash, created_at desc);
alter table public.publish_events enable row level security;
revoke all on public.publish_events from anon, authenticated;

create or replace function public.increment_public_opens (p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.public_projects set opens = opens + 1 where id = p_id and hidden = false;
$$;
revoke all on function public.increment_public_opens (uuid) from public;
grant execute on function public.increment_public_opens (uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-projects', 'public-projects', true, 10485760, array['application/json'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['application/json'];
