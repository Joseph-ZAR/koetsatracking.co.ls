-- Koetsa Operations Platform: initial schema and row-level security.
-- Run in the Supabase SQL Editor for a new project. Never expose the service-role key in the browser.
create extension if not exists pgcrypto;
create sequence if not exists public.customer_number_seq start 1;
create sequence if not exists public.application_number_seq start 1;
create sequence if not exists public.subscription_number_seq start 1;
create sequence if not exists public.receipt_number_seq start 1;

do $$ begin
  create type public.staff_role as enum ('super_admin','general_manager','sales_manager','sales_consultant','office_administrator','technical_manager','installer','finance_officer');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Koetsa Staff',
  role public.staff_role not null default 'sales_consultant',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
  insert into public.profiles(id,full_name,role)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Koetsa Staff'),'sales_consultant')
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_koetsa on auth.users;
create trigger on_auth_user_created_koetsa after insert on auth.users for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_active_staff() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true);
$$;
create or replace function public.staff_has_role(roles public.staff_role[]) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role=any(roles));
$$;
revoke all on function public.is_active_staff() from public;
revoke all on function public.staff_has_role(public.staff_role[]) from public;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.staff_has_role(public.staff_role[]) to authenticated;

-- Only an existing Super Admin can change another staff member's role or active status.
create or replace function public.admin_update_staff_access(p_user_id uuid,p_role text,p_is_active boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.staff_has_role(array['super_admin']::public.staff_role[]) then raise exception 'Super Admin permission required.'; end if;
  if p_user_id=auth.uid() and (p_role<>'super_admin' or p_is_active is not true) then raise exception 'You cannot remove or deactivate your own Super Admin access.'; end if;
  if exists(select 1 from public.profiles where id=p_user_id and role='super_admin' and is_active=true) and (p_role<>'super_admin' or p_is_active is not true) and (select count(*) from public.profiles where role='super_admin' and is_active=true)<=1 then raise exception 'At least one active Super Admin must remain.'; end if;
  if p_role not in ('super_admin','general_manager','sales_manager','sales_consultant','office_administrator','technical_manager','installer','finance_officer') then raise exception 'Invalid staff role.'; end if;
  update public.profiles set role=p_role::public.staff_role,is_active=p_is_active,updated_at=now() where id=p_user_id;
  if not found then raise exception 'Staff profile not found.'; end if;
end; $$;
revoke all on function public.admin_update_staff_access(uuid,text,boolean) from public;
grant execute on function public.admin_update_staff_access(uuid,text,boolean) to authenticated;


create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_no text not null unique default ('KTC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.customer_number_seq')::text,6,'0')),
  full_name text not null,
  phone text not null,
  email text,
  town text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  application_ref text not null unique default ('KTS-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.application_number_seq')::text,6,'0')),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  town text,
  package_code text not null check(package_code in ('m1500','m2500','m3000','m3500')),
  payment_option text not null check(payment_option in ('monthly','upfront')),
  once_off_amount numeric(10,2) not null,
  monthly_amount numeric(10,2) not null,
  contract_months integer not null default 24 check(contract_months=24),
  vehicle_count integer not null default 1 check(vehicle_count between 1 and 100),
  vehicle_summary text,
  vin text,
  preferred_installation_location text,
  preferred_installation_date date,
  notes text,
  consent_at timestamptz not null,
  status text not null default 'new_enquiry' check(status in ('new_enquiry','contacted','qualified','quotation_sent','awaiting_acceptance_payment','installation_scheduled','installation_in_progress','completed_activated','lost_cancelled')),
  created_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  registration text,
  make text,
  model text,
  vin text,
  description text,
  package_code text check(package_code is null or package_code in ('m1500','m2500','m3000','m3500')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.installations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  imei text not null,
  sim_number text,
  installer_name text not null,
  installed_by uuid references public.profiles(id),
  installation_date date not null,
  status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','cancelled')),
  test_result text not null default 'pending' check(test_result in ('pending','passed','failed')),
  certificate_no text unique,
  customer_signed_off_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_no text not null unique default ('KTS-SUB-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.subscription_number_seq')::text,6,'0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  package_code text not null check(package_code in ('m1500','m2500','m3000','m3500')),
  payment_option text not null check(payment_option in ('monthly','upfront')),
  once_off_amount numeric(10,2) not null,
  monthly_amount numeric(10,2) not null,
  contract_months integer not null default 24 check(contract_months=24),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending_payment' check(status in ('pending_payment','active','overdue','suspended','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date>=start_date)
);
create or replace function public.set_subscription_package_rates() returns trigger language plpgsql as $$
begin
  case new.package_code when 'm1500' then new.once_off_amount := 800;new.monthly_amount := 99 when 'm2500' then new.once_off_amount := 1200;new.monthly_amount := 120 when 'm3000' then new.once_off_amount := 1300;new.monthly_amount := 130 when 'm3500' then new.once_off_amount := 1500;new.monthly_amount := 150 else raise exception 'Invalid package code.'; end case;
  new.contract_months=24;
  if new.start_date is not null then new.end_date=(new.start_date + interval '24 months')::date - 1; end if;
  return new;
end; $$;
drop trigger if exists enforce_subscription_package_rates on public.subscriptions;
create trigger enforce_subscription_package_rates before insert or update of package_code,once_off_amount,monthly_amount,contract_months,start_date,end_date on public.subscriptions for each row execute function public.set_subscription_package_rates();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default ('KTS-RCPT-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.receipt_number_seq')::text,6,'0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete restrict,
  amount numeric(10,2) not null check(amount>0),
  currency text not null default 'LSL' check(currency='LSL'),
  payment_type text not null check(payment_type in ('installation_admin','monthly_subscription','full_upfront','other')),
  payment_date date not null default current_date,
  payment_method text not null check(payment_method in ('cash','bank_transfer','mobile_money','card','other')),
  reference text,
  status text not null default 'recorded' check(status in ('recorded','pending','reversed','refunded')),
  recorded_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now()
);

-- Append-only metadata audit trail; values such as phone numbers, IMEIs and VINs are not copied into the log.
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path=public as $$
declare oldj jsonb; newj jsonb; rid uuid; fields text[];
begin
  if tg_op='INSERT' then newj=to_jsonb(new); rid=(newj->>'id')::uuid; fields=array(select jsonb_object_keys(newj));
  elsif tg_op='UPDATE' then oldj=to_jsonb(old); newj=to_jsonb(new); rid=(newj->>'id')::uuid; select array_agg(key) into fields from jsonb_object_keys(newj) as keys(key) where newj->key is distinct from oldj->key;
  else oldj=to_jsonb(old); rid=(oldj->>'id')::uuid; fields=array(select jsonb_object_keys(oldj)); end if;
  insert into public.audit_logs(actor_id,table_name,record_id,action,changed_fields) values(auth.uid(),tg_table_name,rid,tg_op,coalesce(fields,'{}'));
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
do $$ declare t text; begin foreach t in array array['profiles','customers','leads','vehicles','installations','subscriptions','payments'] loop execute format('drop trigger if exists audit_%I on public.%I',t,t); execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t); end loop; end $$;

-- Public website submission endpoint. The caller can submit an enquiry but cannot read customer or lead data.
create or replace function public.submit_koetsa_application(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_name text; v_phone text; v_email text; v_package text; v_payment text; v_setup numeric; v_monthly numeric; v_customer uuid; v_lead uuid; v_vehicle uuid; v_ref text;
begin
  if p_payload is null or length(p_payload::text)>12000 then raise exception 'Invalid application.'; end if;
  if coalesce(p_payload->>'website','')<>'' then raise exception 'Invalid application.'; end if;
  v_name=left(trim(coalesce(p_payload->>'name','')),120); v_phone=left(trim(coalesce(p_payload->>'phone','')),40); v_email=nullif(left(trim(coalesce(p_payload->>'email','')),160),'');
  v_package=lower(coalesce(p_payload->>'package','')); v_payment=lower(coalesce(p_payload->>'payment',''));
  if length(v_name)<2 or length(v_phone)<6 then raise exception 'Name and valid phone number are required.'; end if;
  if v_package not in ('m1500','m2500','m3000','m3500') then raise exception 'Invalid package.'; end if;
  if v_payment not in ('monthly','upfront') then raise exception 'Invalid payment option.'; end if;
  if coalesce((p_payload->>'consent')::boolean,false) is not true then raise exception 'Customer consent is required.'; end if;
  case v_package when 'm1500' then v_setup := 800;v_monthly := 99 when 'm2500' then v_setup := 1200;v_monthly := 120 when 'm3000' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;
  insert into public.customers(full_name,phone,email,town,address) values(v_name,v_phone,v_email,nullif(left(trim(coalesce(p_payload->>'town','')),100),''),nullif(left(trim(coalesce(p_payload->>'address','')),250),'')) returning id into v_customer;
  insert into public.leads(customer_id,customer_name,customer_phone,customer_email,town,package_code,payment_option,once_off_amount,monthly_amount,vehicle_count,vehicle_summary,vin,preferred_installation_location,preferred_installation_date,notes,consent_at)
  values(v_customer,v_name,v_phone,v_email,nullif(left(trim(coalesce(p_payload->>'town','')),100),''),v_package,v_payment,v_setup,v_monthly,greatest(1,least(100,coalesce(nullif(p_payload->>'vehicleCount','')::integer,1))),nullif(left(trim(coalesce(p_payload->>'vehicle','')),300),''),nullif(left(trim(coalesce(p_payload->>'vin','')),80),''),nullif(left(trim(coalesce(p_payload->>'location','')),150),''),nullif(p_payload->>'date','')::date,nullif(left(trim(coalesce(p_payload->>'notes','')),1500),''),now()) returning id,application_ref into v_lead,v_ref;
  insert into public.vehicles(customer_id,description,vin,package_code) values(v_customer,nullif(left(trim(coalesce(p_payload->>'vehicle','')),300),''),nullif(left(trim(coalesce(p_payload->>'vin','')),80),''),v_package) returning id into v_vehicle;
  return jsonb_build_object('application_ref',v_ref,'message','Application received by Koetsa.');
exception when others then
  raise;
end; $$;
revoke all on function public.submit_koetsa_application(jsonb) from public;
grant execute on function public.submit_koetsa_application(jsonb) to anon,authenticated;

-- Authenticated sales staff can register walk-in, phone and referral leads from the portal.
create or replace function public.register_staff_lead(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_name text; v_phone text; v_email text; v_package text; v_payment text; v_setup numeric; v_monthly numeric; v_customer uuid; v_lead uuid; v_ref text; v_creator uuid; v_assignee uuid;
begin
  if not public.is_active_staff() then raise exception 'Active staff access required.'; end if;
  if p_payload is null or length(p_payload::text)>12000 then raise exception 'Invalid lead.'; end if;
  v_name=left(trim(coalesce(p_payload->>'name','')),120); v_phone=left(trim(coalesce(p_payload->>'phone','')),40); v_email=nullif(left(trim(coalesce(p_payload->>'email','')),160),'');
  v_package=lower(coalesce(p_payload->>'package','')); v_payment=lower(coalesce(p_payload->>'payment',''));
  if length(v_name)<2 or length(v_phone)<6 then raise exception 'Name and valid phone number are required.'; end if;
  if v_package not in ('m1500','m2500','m3000','m3500') or v_payment not in ('monthly','upfront') then raise exception 'Select a valid package and payment option.'; end if;
  if coalesce((p_payload->>'consent')::boolean,false) is not true then raise exception 'Customer contact consent must be confirmed.'; end if;
  case v_package when 'm1500' then v_setup := 800;v_monthly := 99 when 'm2500' then v_setup := 1200;v_monthly := 120 when 'm3000' then v_setup := 1300;v_monthly := 130 else v_setup := 1500;v_monthly := 150 end case;
  v_creator=auth.uid();
  if public.staff_has_role(array['sales_consultant']::public.staff_role[]) then v_assignee=auth.uid(); end if;
  insert into public.customers(full_name,phone,email,town,address) values(v_name,v_phone,v_email,nullif(left(trim(coalesce(p_payload->>'town','')),100),''),nullif(left(trim(coalesce(p_payload->>'address','')),250),'')) returning id into v_customer;
  insert into public.leads(customer_id,customer_name,customer_phone,customer_email,town,package_code,payment_option,once_off_amount,monthly_amount,vehicle_count,vehicle_summary,vin,preferred_installation_location,preferred_installation_date,notes,consent_at,created_by,assigned_to)
  values(v_customer,v_name,v_phone,v_email,nullif(left(trim(coalesce(p_payload->>'town','')),100),''),v_package,v_payment,v_setup,v_monthly,greatest(1,least(100,coalesce(nullif(p_payload->>'vehicleCount','')::integer,1))),nullif(left(trim(coalesce(p_payload->>'vehicle','')),300),''),nullif(left(trim(coalesce(p_payload->>'vin','')),80),''),nullif(left(trim(coalesce(p_payload->>'location','')),150),''),nullif(p_payload->>'date','')::date,nullif(left(trim(coalesce(p_payload->>'notes','')),1500),''),now(),v_creator,v_assignee) returning id,application_ref into v_lead,v_ref;
  insert into public.vehicles(customer_id,description,vin,package_code) values(v_customer,nullif(left(trim(coalesce(p_payload->>'vehicle','')),300),''),nullif(left(trim(coalesce(p_payload->>'vin','')),80),''),v_package);
  return jsonb_build_object('application_ref',v_ref,'message','Lead registered.');
end; $$;
revoke all on function public.register_staff_lead(jsonb) from public;
grant execute on function public.register_staff_lead(jsonb) to authenticated;


-- RLS: deny by default, then grant only the appropriate staff role and lead ownership.
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.vehicles enable row level security;
alter table public.installations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profile_self_or_management on public.profiles;
create policy profile_self_or_management on public.profiles for select to authenticated using (id=auth.uid() or public.staff_has_role(array['super_admin','general_manager','sales_manager','office_administrator','technical_manager']::public.staff_role[]));
-- Role changes are deliberately not available through ordinary profile updates. Assign elevated roles
-- through a trusted Supabase SQL/admin process to prevent privilege escalation.

drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated using (public.staff_has_role(array['super_admin','general_manager','sales_manager','office_administrator']::public.staff_role[]) or (public.staff_has_role(array['sales_consultant']::public.staff_role[]) and (created_by=auth.uid() or assigned_to=auth.uid())));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated using (public.staff_has_role(array['super_admin','general_manager','sales_manager','office_administrator']::public.staff_role[]) or (public.staff_has_role(array['sales_consultant']::public.staff_role[]) and (created_by=auth.uid() or assigned_to=auth.uid()))) with check (public.is_active_staff());

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated using (
 public.staff_has_role(array['super_admin','general_manager','sales_manager','office_administrator','technical_manager','finance_officer']::public.staff_role[])
 or exists(select 1 from public.leads l where l.customer_id=customers.id and (l.created_by=auth.uid() or l.assigned_to=auth.uid()))
 or exists(select 1 from public.installations i where i.customer_id=customers.id and i.installed_by=auth.uid())
);
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for all to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','sales_manager']::public.staff_role[])) with check (public.staff_has_role(array['super_admin','general_manager','office_administrator','sales_manager']::public.staff_role[]));

drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to authenticated using (public.staff_has_role(array['super_admin','general_manager','sales_manager','office_administrator','technical_manager','finance_officer']::public.staff_role[]) or exists(select 1 from public.leads l where l.customer_id=vehicles.customer_id and (l.created_by=auth.uid() or l.assigned_to=auth.uid())) or exists(select 1 from public.installations i where i.vehicle_id=vehicles.id and i.installed_by=auth.uid()));
drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for all to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','technical_manager']::public.staff_role[])) with check (public.staff_has_role(array['super_admin','general_manager','office_administrator','technical_manager']::public.staff_role[]));

drop policy if exists installations_read on public.installations;
create policy installations_read on public.installations for select to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','technical_manager']::public.staff_role[]) or (public.staff_has_role(array['installer']::public.staff_role[]) and installed_by=auth.uid()));
drop policy if exists installations_insert on public.installations;
create policy installations_insert on public.installations for insert to authenticated with check (public.staff_has_role(array['super_admin','general_manager','office_administrator','technical_manager']::public.staff_role[]));
drop policy if exists installations_update on public.installations;
create policy installations_update on public.installations for update to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','technical_manager']::public.staff_role[]) or (public.staff_has_role(array['installer']::public.staff_role[]) and installed_by=auth.uid())) with check (public.is_active_staff());

drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','finance_officer','sales_manager']::public.staff_role[]) or exists(select 1 from public.leads l where l.customer_id=subscriptions.customer_id and (l.created_by=auth.uid() or l.assigned_to=auth.uid())));
drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for all to authenticated using (public.staff_has_role(array['super_admin','general_manager','finance_officer','office_administrator']::public.staff_role[])) with check (public.staff_has_role(array['super_admin','general_manager','finance_officer','office_administrator']::public.staff_role[]));

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated using (public.staff_has_role(array['super_admin','general_manager','office_administrator','finance_officer']::public.staff_role[]));
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all to authenticated using (public.staff_has_role(array['super_admin','general_manager','finance_officer']::public.staff_role[])) with check (public.staff_has_role(array['super_admin','general_manager','finance_officer']::public.staff_role[]));

drop policy if exists audit_management_read on public.audit_logs;
create policy audit_management_read on public.audit_logs for select to authenticated using (public.staff_has_role(array['super_admin','general_manager']::public.staff_role[]));

-- No direct anonymous table access. Public website can only call the validated submission function.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon;
grant select on public.profiles,public.customers,public.leads,public.vehicles,public.installations,public.subscriptions,public.payments,public.audit_logs to authenticated;
grant update(status,assigned_to,lost_reason,notes) on public.leads to authenticated;
grant insert,update on public.customers,public.vehicles,public.subscriptions,public.payments to authenticated;
revoke update on public.installations from authenticated;
grant update(status,test_result,customer_signed_off_at,notes) on public.installations to authenticated;
grant insert on public.installations to authenticated;
grant usage,select on all sequences in schema public to authenticated;
