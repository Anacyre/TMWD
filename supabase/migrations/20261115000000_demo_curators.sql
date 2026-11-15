alter table public.public_projects add column if not exists is_demo boolean not null default false;
create index if not exists public_projects_demos on public.public_projects (is_demo, created_at desc);
grant select (is_demo) on public.public_projects to anon, authenticated;

create table if not exists public.demo_curators (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.demo_curators enable row level security;
drop policy if exists "curators see themselves" on public.demo_curators;
create policy "curators see themselves" on public.demo_curators
  for select to authenticated using (user_id = auth.uid());
revoke all on public.demo_curators from anon, authenticated;
grant select on public.demo_curators to authenticated;

insert into public.demo_curators (user_id)
select id from auth.users where lower(email) = 'midixiong@outlook.com'
on conflict (user_id) do nothing;
