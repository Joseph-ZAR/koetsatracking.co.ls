-- Koetsa employee onboarding: immediate activation with mandatory first password change.
begin;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Employees can clear the first-login flag only for their own authenticated account.
create or replace function public.complete_staff_first_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = auth.uid()
     and is_active = true;

  if not found then
    raise exception 'Active staff profile not found.';
  end if;
end;
$$;

revoke all on function public.complete_staff_first_login() from public;
grant execute on function public.complete_staff_first_login() to authenticated;

commit;
