-- Beta credits are REQUEST units, not tokens or money. Conservative debit on
-- admission, including interrupted/provider-failed requests; no unsafe refunds.
begin;
create table glow_private.ai_budget (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 daily_requests integer not null default 50 check(daily_requests between 1 and 10000)
);
insert into glow_private.ai_budget(id) values(true);
create table glow_private.ai_requests (
 id uuid primary key,
 user_id uuid not null references public.glow_access(user_id),
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index ai_requests_user_time on glow_private.ai_requests(user_id,created_at);
create index ai_requests_time on glow_private.ai_requests(created_at);
alter table glow_private.ai_budget enable row level security;
alter table glow_private.ai_requests enable row level security;
revoke all on glow_private.ai_budget,glow_private.ai_requests from public,anon,authenticated;

create function public.glow_admit_ai_request(p_user uuid,p_request uuid) returns text
language plpgsql security definer set search_path='' as $$
declare limits glow_private.ai_budget; allowance bigint;
begin
 -- Global row lock makes check+debit atomic even across serverless instances.
 select * into limits from glow_private.ai_budget where id=true for update;
 if not found or not limits.enabled then return 'disabled'; end if;
 perform 1 from public.glow_access where user_id=p_user and active for update;
 if not found then return 'inactive'; end if;
 -- Retried admission must never cause a second upstream request or debit.
 if exists(select 1 from glow_private.ai_requests where id=p_request) then return 'concurrent'; end if;
 if exists(select 1 from glow_private.ai_requests where user_id=p_user and finished_at is null
   and created_at > now()-interval '120 seconds') then return 'concurrent'; end if;
 if (select count(*) from glow_private.ai_requests where user_id=p_user
   and created_at>now()-interval '1 minute') >= 6 then return 'rate'; end if;
 if (select count(*) from glow_private.ai_requests where created_at >=
   date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= limits.daily_requests then return 'budget'; end if;
 select coalesce(sum(amount),0) into allowance from public.glow_credit_ledger where user_id=p_user;
 if allowance<1 then return 'credits'; end if;
 insert into glow_private.ai_requests(id,user_id) values(p_request,p_user);
 insert into public.glow_credit_ledger(user_id,amount,reason,request_id)
 values(p_user,-1,'AI beta request allowance',p_request);
 return 'accepted';
end; $$;
create function public.glow_finish_ai_request(p_request uuid) returns void
language sql security definer set search_path='' as $$
 update glow_private.ai_requests set finished_at=coalesce(finished_at,now()) where id=p_request;
$$;
revoke all on function public.glow_admit_ai_request(uuid,uuid),public.glow_finish_ai_request(uuid) from public,anon,authenticated;
grant execute on function public.glow_admit_ai_request(uuid,uuid),public.glow_finish_ai_request(uuid) to service_role;
commit;
