create table if not exists public.app_flags (
  key text primary key,
  value boolean not null default false
);
alter table public.app_flags enable row level security;
drop policy if exists "flags are public" on public.app_flags;
create policy "flags are public" on public.app_flags
  for select to anon, authenticated using (true);
revoke all on public.app_flags from anon, authenticated;
grant select on public.app_flags to anon, authenticated;
