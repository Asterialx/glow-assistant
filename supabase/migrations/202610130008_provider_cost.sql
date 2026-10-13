begin;
alter table public.glow_token_requests add column cost_usd numeric(20,12)
 check(cost_usd is null or cost_usd>=0);
-- Keep old settlements intact; never invent a historical price.
create function public.glow_settle_token_usage(p_request uuid,p_input bigint,p_output bigint,p_total bigint,p_failed boolean,p_cost numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_cost is not null and (p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid cost'; end if;
 perform public.glow_settle_tokens(p_request,p_input,p_output,p_total,p_failed);
 if p_cost is not null then
   update public.glow_token_requests set cost_usd=p_cost where id=p_request and status='settled' and cost_usd is null;
 end if;
end; $$;
revoke all on function public.glow_settle_token_usage(uuid,bigint,bigint,bigint,boolean,numeric) from public,anon,authenticated;
grant execute on function public.glow_settle_token_usage(uuid,bigint,bigint,bigint,boolean,numeric) to service_role;
commit;
