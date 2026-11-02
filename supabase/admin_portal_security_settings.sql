-- Adds admin access policies, audit logging, and security settings for the Admin Portal.

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
grant select on public.reports, public.categories,
  public.community_posts, public.comments, public.likes to authenticated;
grant update on public.reports, public.community_posts to authenticated;

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

drop policy if exists "admin can read service reports"
  on public.reports;
create policy "admin can read service reports"
  on public.reports
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can read categories"
  on public.categories;
create policy "admin can read categories"
  on public.categories
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can read community posts"
  on public.community_posts;
create policy "admin can read community posts"
  on public.community_posts
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can read community comments"
  on public.comments;
create policy "admin can read community comments"
  on public.comments
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can read community likes"
  on public.likes;
create policy "admin can read community likes"
  on public.likes
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

drop policy if exists "admin can update community posts"
  on public.community_posts;
create policy "admin can update community posts"
  on public.community_posts
  for update
  to authenticated
  using ((select public.is_trackserv_admin()))
  with check ((select public.is_trackserv_admin()));

drop policy if exists "admin can update service reports"
  on public.reports;
create policy "admin can update service reports"
  on public.reports
  for update
  to authenticated
  using ((select public.is_trackserv_admin()))
  with check ((select public.is_trackserv_admin()));

drop policy if exists "admin can read service listings"
  on public.service_listings;
drop policy if exists "admin can read listing reviews"
  on public.listing_reviews;
drop policy if exists "admin can read listing payments"
  on public.ad_payments;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text not null,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;

drop policy if exists "admin can read audit logs"
  on public.audit_logs;
create policy "admin can read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using ((select public.is_trackserv_admin()));

create or replace function public.log_admin_data_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  source_row jsonb;
  changed jsonb := '{}'::jsonb;
  field_name text;
  record_key text;
  field_names text[];
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
  end if;
  source_row := coalesce(new_row, old_row);

  field_names := case tg_table_name
    when 'profiles' then array['role', 'is_suspended', 'is_banned', 'flagged_post_count']
    when 'reports' then array['status', 'severity', 'assigned_to', 'assigned_to_group_id']
    when 'community_posts' then array['status', 'visibility']
    when 'user_reports' then array['status', 'action_taken', 'reviewed_by']
    else array[]::text[]
  end;

  foreach field_name in array field_names loop
    if old_row -> field_name is distinct from new_row -> field_name then
      changed := changed || jsonb_build_object(
        field_name,
        jsonb_build_object('before', old_row -> field_name, 'after', new_row -> field_name)
      );
    end if;
  end loop;

  record_key := coalesce(
    source_row ->> 'id',
    source_row ->> 'report_id',
    'unknown'
  );

  insert into public.audit_logs (actor_id, action, table_name, record_id, changed_fields)
  values (auth.uid(), lower(tg_op), tg_table_name, record_key, changed);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.log_admin_data_change() from public, anon, authenticated;

drop trigger if exists audit_profiles_changes on public.profiles;
create trigger audit_profiles_changes
  after insert or update or delete on public.profiles
  for each row execute function public.log_admin_data_change();

drop trigger if exists audit_service_report_changes on public.reports;
create trigger audit_service_report_changes
  after insert or update or delete on public.reports
  for each row execute function public.log_admin_data_change();

drop trigger if exists audit_community_post_changes on public.community_posts;
create trigger audit_community_post_changes
  after insert or update or delete on public.community_posts
  for each row execute function public.log_admin_data_change();

drop trigger if exists audit_community_report_changes on public.user_reports;
create trigger audit_community_report_changes
  after insert or update or delete on public.user_reports
  for each row execute function public.log_admin_data_change();

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
