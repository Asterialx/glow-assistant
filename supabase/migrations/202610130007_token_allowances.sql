-- Token allowances are independent of the obsolete per-request credit ledger.
-- No automatic conversion: seven old request credits are NOT seven tokens.
begin;
create table public.glow_token_wallets (
 user_id uuid primary key references public.glow_access(user_id),
 granted bigint not null default 0 check(granted>=0),
 used bigint not null default 0 check(used>=0)
);
create table public.glow_token_grants (
 id uuid primary key, user_id uuid not null references public.glow_access(user_id),
 amount integer not null check(amount between 1 and 1000000), reason text not null,
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.glow_token_requests (
 id uuid primary key, user_id uuid not null references public.glow_access(user_id),
 model text not null, reserved integer not null check(reserved between 1 and 1000000),
 input_tokens bigint, output_tokens bigint, total_tokens bigint,
 status text not null default 'reserved' check(status in ('reserved','pending','settled','failed')),
 created_at timestamptz not null default now(), finished_at timestamptz,
 check(input_tokens is null or input_tokens>=0), check(output_tokens is null or output_tokens>=0),
 check(total_tokens is null or total_tokens>=0)
);
create index glow_token_requests_owner_time on public.glow_token_requests(user_id,created_at desc);
alter table public.glow_token_wallets enable row level security;
alter table public.glow_token_grants enable row level security;
alter table public.glow_token_requests enable row level security;
revoke all on public.glow_token_wallets,public.glow_token_grants,public.glow_token_requests from public,anon,authenticated;
grant select on public.glow_token_wallets,public.glow_token_grants,public.glow_token_requests to authenticated;
grant all on public.glow_token_wallets,public.glow_token_grants,public.glow_token_requests to service_role;
create policy token_wallet_read on public.glow_token_wallets for select to authenticated
 using((user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active)) or glow_private.is_admin());
create policy token_grants_read on public.glow_token_grants for select to authenticated
 using((user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active)) or glow_private.is_admin());
create policy token_requests_read on public.glow_token_requests for select to authenticated
 using((user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active)) or glow_private.is_admin());
insert into public.glow_token_wallets(user_id) select user_id from public.glow_access;
create function glow_private.token_wallet_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.glow_token_wallets(user_id,granted) values(new.user_id,
   coalesce((select initial_credits from public.glow_invites where email=new.email),0));
 return new;
end; $$;
revoke all on function glow_private.token_wallet_created() from public;
create trigger glow_token_wallet_created after insert on public.glow_access
 for each row execute function glow_private.token_wallet_created();

create function public.glow_token_summary() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('granted',w.granted,'used',w.used,'reserved',coalesce(r.held,0),
   'remaining',greatest(0,w.granted-w.used-coalesce(r.held,0)))
 from public.glow_token_wallets w left join lateral (
   select sum(reserved) held from public.glow_token_requests where user_id=w.user_id and status in ('reserved','pending')
 ) r on true where w.user_id=auth.uid();
$$;
create function public.glow_admin_token_grant(p_user uuid,p_amount integer,p_reason text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare existing public.glow_token_grants;
begin
 if not glow_private.is_admin() then raise exception 'Administrator required'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 or p_request is null
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

create function public.glow_reserve_tokens(p_user uuid,p_request uuid,p_reserve integer,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare limits glow_private.ai_budget; wallet public.glow_token_wallets; held bigint;
begin
 if p_reserve is null or p_reserve not between 1 and 1000000 or p_request is null or p_model is null then return 'invalid'; end if;
 select * into limits from glow_private.ai_budget where id=true for update;
 if not found or not limits.enabled then return 'disabled'; end if;
 if not exists(select 1 from public.glow_access where user_id=p_user and active) then return 'inactive'; end if;
 select * into wallet from public.glow_token_wallets where user_id=p_user for update;
 if not found then return 'credits'; end if;
 if exists(select 1 from glow_private.ai_requests where id=p_request) then return 'concurrent'; end if;
 if exists(select 1 from glow_private.ai_requests where user_id=p_user and finished_at is null
   and created_at>now()-interval '120 seconds') then return 'concurrent'; end if;
 if (select count(*) from glow_private.ai_requests where user_id=p_user and created_at>now()-interval '1 minute')>=6 then return 'rate'; end if;
 if (select count(*) from glow_private.ai_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=limits.daily_requests then return 'budget'; end if;
 select coalesce(sum(reserved),0) into held from public.glow_token_requests where user_id=p_user and status in ('reserved','pending');
 if wallet.granted-wallet.used-held<p_reserve then return 'credits'; end if;
 insert into glow_private.ai_requests(id,user_id) values(p_request,p_user);
 insert into public.glow_token_requests(id,user_id,model,reserved) values(p_request,p_user,p_model,p_reserve);
 return 'accepted';
end; $$;
create function public.glow_settle_tokens(p_request uuid,p_input bigint,p_output bigint,p_total bigint,p_failed boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare item public.glow_token_requests;
begin
 select * into item from public.glow_token_requests where id=p_request for update;
 if not found or item.status in ('settled','failed') then return; end if;
 if p_failed then
   update public.glow_token_requests set status='failed',finished_at=now() where id=p_request;
 elsif p_input is null or p_output is null or p_total is null then
   update public.glow_token_requests set status='pending',finished_at=now() where id=p_request;
 else
   if p_input<0 or p_output<0 or p_total<>p_input+p_output then raise exception 'Invalid provider usage'; end if;
   update public.glow_token_wallets set used=used+p_total where user_id=item.user_id;
   update public.glow_token_requests set status='settled',input_tokens=p_input,output_tokens=p_output,total_tokens=p_total,finished_at=now() where id=p_request;
 end if;
 update glow_private.ai_requests set finished_at=now() where id=p_request;
end; $$;
revoke all on function public.glow_token_summary(),public.glow_admin_token_grant(uuid,integer,text,uuid),
 public.glow_reserve_tokens(uuid,uuid,integer,text),public.glow_settle_tokens(uuid,bigint,bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.glow_token_summary(),public.glow_admin_token_grant(uuid,integer,text,uuid) to authenticated;
grant execute on function public.glow_reserve_tokens(uuid,uuid,integer,text),public.glow_settle_tokens(uuid,bigint,bigint,bigint,boolean) to service_role;
commit;
