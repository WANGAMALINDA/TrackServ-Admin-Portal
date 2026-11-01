-- Adds the settings table used by the Admin Portal.
-- User accounts and account reports use the existing profiles and user_reports tables.

create or replace function public.is_trackserv_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  );
$$;

revoke all on function public.is_trackserv_admin() from public;
grant execute on function public.is_trackserv_admin() to authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.user_reports to authenticated;

drop policy if exists "admin can read all profiles"
  on public.profiles;
create policy "admin can read all profiles"
  on public.profiles
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can update profiles"
  on public.profiles;
create policy "admin can update profiles"
  on public.profiles
  for update
  to authenticated
  using ((select public.is_trackserv_admin()))
  with check ((select public.is_trackserv_admin()));

drop policy if exists "admin can read account reports"
  on public.user_reports;
create policy "admin can read account reports"
  on public.user_reports
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can update account reports"
  on public.user_reports;
create policy "admin can update account reports"
  on public.user_reports
  for update
  to authenticated
  using ((select public.is_trackserv_admin()))
  with check ((select public.is_trackserv_admin()));

create table if not exists public.admin_security_settings (
  id smallint primary key default 1 check (id = 1),
  two_factor boolean not null default false,
  password_expiry boolean not null default false,
  login_alerts boolean not null default false,
  last_password_change timestamptz
);

insert into public.admin_security_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.admin_security_settings enable row level security;

grant select, update on public.admin_security_settings to authenticated;

drop policy if exists "admin can read security settings"
  on public.admin_security_settings;
create policy "admin can read security settings"
  on public.admin_security_settings
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can update security settings"
  on public.admin_security_settings;
create policy "admin can update security settings"
  on public.admin_security_settings
  for update
  to authenticated
  using ((select public.is_trackserv_admin()))
  with check ((select public.is_trackserv_admin()));
