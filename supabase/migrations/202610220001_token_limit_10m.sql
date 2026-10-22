begin;

-- Raise the issuable limit from 1 000 000 to 10 000 000 tokens: invitations, admin grants and the stored checks.
alter table public.glow_invites drop constraint if exists glow_invites_initial_credits_check;
alter table public.glow_invites add constraint glow_invites_initial_credits_check check (initial_credits between 0 and 10000000);

alter table public.glow_token_grants drop constraint if exists glow_token_grants_amount_check;
alter table public.glow_token_grants add constraint glow_token_grants_amount_check check (amount between 1 and 10000000);

create or replace function public.glow_admin_invite(p_email text, p_credits bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_email is null or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_credits is null or p_credits < 0 or p_credits > 10000000 then raise exception 'Invalid invitation'; end if;
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

create or replace function public.glow_admin_token_grant(p_user uuid,p_amount integer,p_reason text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare existing public.glow_token_grants;
begin
 if not glow_private.is_admin() then raise exception 'Administrator required'; end if;
 if p_amount is null or p_amount<1 or p_amount>10000000 or p_request is null
   or p_reason is null or length(trim(p_reason)) not between 1 and 240 then raise exception 'Invalid grant'; end if;
 perform 1 from public.glow_token_wallets where user_id=p_user for update;
 if not found then raise exception 'User not found'; end if;
 select * into existing from public.glow_token_grants where id=p_request;
 if found then
   if existing.user_id<>p_user or existing.amount<>p_amount or existing.reason<>trim(p_reason) then raise exception 'Conflicting grant'; end if;
   return;
 end if;
 insert into public.glow_token_grants(id,user_id,amount,reason,actor_id) values(p_request,p_user,p_amount,trim(p_reason),auth.uid());
 update public.glow_token_wallets set granted=granted+p_amount where user_id=p_user;
end; $$;

commit;
