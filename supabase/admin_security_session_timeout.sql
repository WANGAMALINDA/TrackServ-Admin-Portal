-- Adds a configurable idle sign-out duration for admin portal sessions.
begin;

alter table public.admin_security_settings
  add column if not exists idle_timeout_minutes smallint not null default 5;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.admin_security_settings'::regclass
      and conname = 'admin_security_settings_idle_timeout_minutes_check'
  ) then
    alter table public.admin_security_settings
      add constraint admin_security_settings_idle_timeout_minutes_check
      check (idle_timeout_minutes in (5, 10, 15, 30));
  end if;
end;
$$;

commit;
