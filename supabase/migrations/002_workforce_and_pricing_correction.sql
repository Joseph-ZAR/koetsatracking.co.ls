-- Koetsa Operations Portal upgrade 002
-- Safe additive upgrade for an existing project. Does not drop business records.
begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists job_title text,
  add column if not exists employment_start_date date,
  add column if not exists invited_by uuid references auth.users(id);

update public.profiles p set email=u.email from auth.users u where u.id=p.id and p.email is null;

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists customers_phone_normalized_idx on public.customers (regexp_replace(phone,'[^0-9]','','g'));

-- Correct package-rate trigger. The old migration's CASE statement omitted separators.
create or replace function public.set_subscription_package_rates()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  case new.package_code
    when 'm1500' then
      if new.payment_option = 'upfront' then new.once_off_amount := 1500; new.monthly_amount := 0;
      else new.once_off_amount := 800; new.monthly_amount := 75; end if;
    when 'm2500' then
      if new.payment_option = 'upfront' then new.once_off_amount := 2500; new.monthly_amount := 0;
      else new.once_off_amount := 1200; new.monthly_amount := 120; end if;
    when 'm3000' then
      if new.payment_option = 'upfront' then new.once_off_amount := 3000; new.monthly_amount := 0;
      else new.once_off_amount := 1300; new.monthly_amount := 130; end if;
    when 'm3500' then
      if new.payment_option = 'upfront' then new.once_off_amount := 3500; new.monthly_amount := 0;
      else new.once_off_amount := 1500; new.monthly_amount := 150; end if;
    else raise exception 'Invalid package code.';
  end case;
  new.contract_months := 24;
  if new.start_date is not null then
    new.end_date := (new.start_date + interval '24 months')::date - 1;
  end if;
  return new;
end; $$;

drop trigger if exists enforce_subscription_package_rates on public.subscriptions;
create trigger enforce_subscription_package_rates
before insert or update of package_code,payment_option,once_off_amount,monthly_amount,contract_months,start_date,end_date
on public.subscriptions for each row execute function public.set_subscription_package_rates();

-- Update the two existing application RPCs in-place without changing their validation,
-- customer creation or lead attribution logic.
do $$
declare f text;
begin
  f := pg_get_functiondef('public.submit_koetsa_application(jsonb)'::regprocedure);
  f := replace(f, 'v_monthly := 99', 'v_monthly := 75');
  f := replace(f, 'case v_package when ''m1500'' then v_setup := 800;v_monthly := 75 when ''m2500'' then v_setup := 1200;v_monthly := 120 when ''m3000'' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;', 'case v_package
    when ''m1500'' then if v_payment=''upfront'' then v_setup := 1500; v_monthly := 0; else v_setup := 800; v_monthly := 75; end if;
    when ''m2500'' then if v_payment=''upfront'' then v_setup := 2500; v_monthly := 0; else v_setup := 1200; v_monthly := 120; end if;
    when ''m3000'' then if v_payment=''upfront'' then v_setup := 3000; v_monthly := 0; else v_setup := 1300; v_monthly := 130; end if;
    else if v_payment=''upfront'' then v_setup := 3500; v_monthly := 0; else v_setup := 1500; v_monthly := 150; end if;
  end case;');
  if position('case v_package when ''m1500'' then v_setup := 800;v_monthly := 75 when ''m2500'' then v_setup := 1200;v_monthly := 120 when ''m3000'' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;' in f)>0 then raise exception 'Could not correct payment-option pricing.'; end if;
  if position('v_monthly := 99' in f)>0 then raise exception 'Could not update public application Track & Trace rate.'; end if;
  execute f;
  f := pg_get_functiondef('public.register_staff_lead(jsonb)'::regprocedure);
  f := replace(f, 'v_monthly := 99', 'v_monthly := 75');
  f := replace(f, 'case v_package when ''m1500'' then v_setup := 800;v_monthly := 75 when ''m2500'' then v_setup := 1200;v_monthly := 120 when ''m3000'' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;', 'case v_package
    when ''m1500'' then if v_payment=''upfront'' then v_setup := 1500; v_monthly := 0; else v_setup := 800; v_monthly := 75; end if;
    when ''m2500'' then if v_payment=''upfront'' then v_setup := 2500; v_monthly := 0; else v_setup := 1200; v_monthly := 120; end if;
    when ''m3000'' then if v_payment=''upfront'' then v_setup := 3000; v_monthly := 0; else v_setup := 1300; v_monthly := 130; end if;
    else if v_payment=''upfront'' then v_setup := 3500; v_monthly := 0; else v_setup := 1500; v_monthly := 150; end if;
  end case;');
  if position('case v_package when ''m1500'' then v_setup := 800;v_monthly := 75 when ''m2500'' then v_setup := 1200;v_monthly := 120 when ''m3000'' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;' in f)>0 then raise exception 'Could not correct payment-option pricing.'; end if;
  if position('v_monthly := 99' in f)>0 then raise exception 'Could not update staff lead Track & Trace rate.'; end if;
  f := replace(f,
    'insert into public.customers(full_name,phone,email,town,address)',
    'if exists (select 1 from public.customers c where regexp_replace(c.phone, ''[^0-9]'', '''', ''g'')=regexp_replace(v_phone, ''[^0-9]'', '''', ''g'') or (v_email is not null and lower(c.email)=lower(v_email))) then raise exception ''A customer with this phone number or email already exists. Ask your manager to review the existing customer record.''; end if; insert into public.customers(full_name,phone,email,town,address)');
  if position('if exists (select 1 from public.customers c' in f)=0 then raise exception 'Could not install duplicate customer check.'; end if;
  execute f;
end $$;

-- Management can administer ordinary employees. Only a Super Admin can assign the
-- Super Admin role or modify an existing Super Admin account.
create or replace function public.admin_update_staff_access(
  p_user_id uuid, p_role text, p_is_active boolean
) returns void
language plpgsql security definer set search_path=public as $$
declare caller_role public.staff_role;
declare target_role public.staff_role;
begin
  select role into caller_role from public.profiles where id=auth.uid() and is_active=true;
  if caller_role is null or caller_role not in ('super_admin','general_manager') then
    raise exception 'Super Admin or General Manager permission required.';
  end if;
  if p_role not in ('super_admin','general_manager','sales_manager','sales_consultant','office_administrator','technical_manager','installer','finance_officer') then
    raise exception 'Invalid staff role.';
  end if;
  select role into target_role from public.profiles where id=p_user_id;
  if not found then raise exception 'Staff profile not found.'; end if;
  if caller_role='general_manager' and (p_role='super_admin' or target_role='super_admin') then
    raise exception 'Only a Super Admin can change a Super Admin account or assign the Super Admin role.';
  end if;
  if p_user_id=auth.uid() and (p_role<>caller_role::text or p_is_active is not true) then
    raise exception 'You cannot change your own role or deactivate your own account.';
  end if;
  if target_role='super_admin' and (p_role<>'super_admin' or p_is_active is not true)
     and (select count(*) from public.profiles where role='super_admin' and is_active=true)<=1 then
    raise exception 'At least one active Super Admin must remain.';
  end if;
  update public.profiles set role=p_role::public.staff_role,is_active=p_is_active,updated_at=now()
  where id=p_user_id;
end; $$;
revoke all on function public.admin_update_staff_access(uuid,text,boolean) from public;
grant execute on function public.admin_update_staff_access(uuid,text,boolean) to authenticated;

create or replace function public.admin_update_staff_details(
  p_user_id uuid, p_full_name text, p_phone text, p_department text, p_job_title text, p_employment_start_date date
) returns void
language plpgsql security definer set search_path=public as $$
declare caller_role public.staff_role;
declare target_role public.staff_role;
begin
  select role into caller_role from public.profiles where id=auth.uid() and is_active=true;
  if caller_role is null or caller_role not in ('super_admin','general_manager') then
    raise exception 'Super Admin or General Manager permission required.';
  end if;
  select role into target_role from public.profiles where id=p_user_id;
  if not found then raise exception 'Staff profile not found.'; end if;
  if caller_role='general_manager' and target_role='super_admin' then
    raise exception 'Only a Super Admin can edit a Super Admin profile.';
  end if;
  update public.profiles
  set full_name=coalesce(nullif(left(trim(coalesce(p_full_name,'')),120),''),full_name),
      phone=nullif(left(trim(coalesce(p_phone,'')),40),''),
      department=nullif(left(trim(coalesce(p_department,'')),80),''),
      job_title=nullif(left(trim(coalesce(p_job_title,'')),100),''),
      employment_start_date=p_employment_start_date,
      updated_at=now()
  where id=p_user_id;
end; $$;
revoke all on function public.admin_update_staff_details(uuid,text,text,text,text,date) from public;
grant execute on function public.admin_update_staff_details(uuid,text,text,text,text,date) to authenticated;

commit;
