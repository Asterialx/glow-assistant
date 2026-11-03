-- The abliterated model is limited to 5 requests per user per UTC day (administrators are exempt).
-- Failed requests do not count. Everything else in the function is unchanged from 202611030001.
begin;

create or replace function public.glow_reserve_tokens(p_user uuid,p_request uuid,p_reserve integer,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare limits glow_private.ai_budget; wallet public.glow_token_wallets; held bigint; is_admin boolean;
begin
 if p_reserve is null or p_reserve not between 1 and 1000000 or p_request is null or p_model is null then return 'invalid'; end if;
 select * into limits from glow_private.ai_budget where id=true for update;
 if not found or not limits.enabled then return 'disabled'; end if;
 if not exists(select 1 from public.glow_access where user_id=p_user and active) then return 'inactive'; end if;
 select exists(select 1 from public.glow_access where user_id=p_user and role='admin' and active) into is_admin;
 select * into wallet from public.glow_token_wallets where user_id=p_user for update;
 if not found then return 'credits'; end if;
 if exists(select 1 from glow_private.ai_requests where id=p_request) then return 'concurrent'; end if;
 if exists(select 1 from glow_private.ai_requests where user_id=p_user and finished_at is null
   and created_at>now()-interval '120 seconds') then return 'concurrent'; end if;
 if not is_admin then
   if (select count(*) from glow_private.ai_requests where user_id=p_user and created_at>now()-interval '1 minute')>=60 then return 'rate'; end if;
   if (select count(*) from glow_private.ai_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=limits.daily_requests then return 'budget'; end if;
   if p_model='abliterated-model-large-flash' and (select count(*) from public.glow_token_requests
     where user_id=p_user and model=p_model and status<>'failed'
       and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=5 then return 'model_limit'; end if;
   select coalesce(sum(reserved),0) into held from public.glow_token_requests where user_id=p_user and status in ('reserved','pending');
   if wallet.granted-wallet.used-held<p_reserve then return 'credits'; end if;
 end if;
 insert into glow_private.ai_requests(id,user_id) values(p_request,p_user);
 insert into public.glow_token_requests(id,user_id,model,reserved) values(p_request,p_user,p_model,p_reserve);
 return 'accepted';
end; $$;

commit;
