-- Closed beta foundation. No client can assign roles or write the credit ledger.
begin;
create schema if not exists glow_private;
revoke all on schema glow_private from public, anon, authenticated;

create table public.glow_invites (
  email text primary key check (email = lower(trim(email)) and length(email) between 3 and 254),
  role text not null default 'member' check (role in ('member', 'admin')),
  initial_credits bigint not null default 0 check (initial_credits between 0 and 1000000),
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_by uuid unique references auth.users(id),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.glow_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('member', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.glow_profiles (
  user_id uuid primary key references public.glow_access(user_id) on delete cascade,
  display_name text not null default '' check (length(trim(display_name)) <= 60),
  age smallint check (age between 1 and 120),
  onboarding_completed boolean not null default false
);
create table public.glow_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.glow_access(user_id),
  amount bigint not null check (amount <> 0 and amount between -1000000 and 1000000),
  reason text not null check (length(trim(reason)) between 1 and 240),
  request_id uuid not null unique,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index glow_credit_ledger_user on public.glow_credit_ledger(user_id, created_at);
create table public.glow_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

alter table public.glow_invites enable row level security;
alter table public.glow_access enable row level security;
alter table public.glow_profiles enable row level security;
alter table public.glow_credit_ledger enable row level security;
alter table public.glow_admin_events enable row level security;
revoke all on public.glow_invites, public.glow_access, public.glow_profiles,
  public.glow_credit_ledger, public.glow_admin_events from anon, authenticated;
grant all on public.glow_invites, public.glow_access, public.glow_profiles,
  public.glow_credit_ledger, public.glow_admin_events to service_role;

create function glow_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.glow_access
    where user_id = auth.uid() and role = 'admin' and active);
$$;
revoke all on function glow_private.is_admin() from public;
grant usage on schema glow_private to authenticated;
grant execute on function glow_private.is_admin() to authenticated;

create policy access_read on public.glow_access for select to authenticated
  using (user_id = auth.uid() or glow_private.is_admin());
create policy profile_read on public.glow_profiles for select to authenticated
  using (user_id = auth.uid());
create policy profile_edit on public.glow_profiles for update to authenticated
  using (user_id = auth.uid() and exists(select 1 from public.glow_access where user_id = auth.uid() and active))
  with check (user_id = auth.uid());
create policy ledger_read on public.glow_credit_ledger for select to authenticated
  using (user_id = auth.uid() or glow_private.is_admin());
create policy invites_read on public.glow_invites for select to authenticated
  using (glow_private.is_admin());
create policy events_read on public.glow_admin_events for select to authenticated
  using (glow_private.is_admin());
grant select on public.glow_access, public.glow_profiles, public.glow_credit_ledger,
  public.glow_invites, public.glow_admin_events to authenticated;
grant update (display_name, age, onboarding_completed) on public.glow_profiles to authenticated;

create function glow_private.accept_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invitation public.glow_invites;
begin
  select * into invitation from public.glow_invites
    where email = lower(trim(new.email)) and claimed_by is null and expires_at > now() for update;
  if not found then raise exception 'An active invitation is required'; end if;
  insert into public.glow_access(user_id,email,role) values(new.id, invitation.email, invitation.role);
  insert into public.glow_profiles(user_id) values(new.id);
  update public.glow_invites set claimed_by = new.id where email = invitation.email;
  if invitation.initial_credits > 0 then
    insert into public.glow_credit_ledger(user_id,amount,reason,request_id,actor_id)
      values(new.id, invitation.initial_credits, 'Initial invitation allowance', gen_random_uuid(), invitation.invited_by);
  end if;
  return new;
end;
$$;
revoke all on function glow_private.accept_invite() from public;
create trigger glow_accept_invite after insert on auth.users
  for each row execute function glow_private.accept_invite();

create function public.glow_admin_invite(p_email text, p_credits bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_email is null or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_credits is null or p_credits < 0 or p_credits > 1000000 then raise exception 'Invalid invitation'; end if;
  if exists(select 1 from public.glow_access where email = lower(trim(p_email))) then
    raise exception 'Account already exists'; end if;
  insert into public.glow_invites(email,initial_credits,invited_by)
    values(lower(trim(p_email)),p_credits,auth.uid())
    on conflict(email) do update set initial_credits = excluded.initial_credits,
      invited_by = auth.uid(), expires_at = now() + interval '30 days'
      where public.glow_invites.claimed_by is null;
  insert into public.glow_admin_events(actor_id,action,target) values(auth.uid(),'prepare_invitation',lower(trim(p_email)));
end;
$$;
create function public.glow_admin_credit(p_user uuid,p_amount bigint,p_reason text,p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare previous public.glow_credit_ledger;
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_request is null or p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Invalid credit amount'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into previous from public.glow_credit_ledger where request_id = p_request;
  if found then
    if previous.user_id = p_user and previous.amount = p_amount and previous.reason = trim(p_reason) and previous.actor_id = auth.uid() then return; end if;
    raise exception 'Request ID has already been used';
  end if;
  insert into public.glow_credit_ledger(user_id,amount,reason,request_id,actor_id)
    values(p_user,p_amount,trim(p_reason),p_request,auth.uid());
  insert into public.glow_admin_events(actor_id,action,target) values(auth.uid(),'credit',p_user::text);
end;
$$;
create function public.glow_admin_access(p_user uuid,p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_user = auth.uid() then raise exception 'Cannot change your own access'; end if;
  if p_active is null then raise exception 'Invalid access status'; end if;
  update public.glow_access set active = p_active where user_id = p_user;
  if not found then raise exception 'User not found'; end if;
  insert into public.glow_admin_events(actor_id,action,target)
    values(auth.uid(),case when p_active then 'unblock' else 'block' end,p_user::text);
end;
$$;
revoke all on function public.glow_admin_invite(text,bigint), public.glow_admin_credit(uuid,bigint,text,uuid),
  public.glow_admin_access(uuid,boolean) from public, anon;
grant execute on function public.glow_admin_invite(text,bigint), public.glow_admin_credit(uuid,bigint,text,uuid),
  public.glow_admin_access(uuid,boolean) to authenticated;

create function public.glow_admin_members()
returns table(user_id uuid,email text,role text,active boolean,balance bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  return query select a.user_id,a.email,a.role,a.active,coalesce(sum(l.amount),0)::bigint
    from public.glow_access a left join public.glow_credit_ledger l on l.user_id = a.user_id
    group by a.user_id,a.email,a.role,a.active order by a.created_at;
end;
$$;
revoke all on function public.glow_admin_members() from public, anon;
grant execute on function public.glow_admin_members() to authenticated;

-- Authorization comes from this protected invitation, never user-editable metadata.
insert into public.glow_invites(email,role) values('kulichevserg6@gmail.com','admin');
commit;
