begin;

alter table public.glow_token_requests
  add column cache_read_tokens bigint check (cache_read_tokens is null or cache_read_tokens >= 0),
  add column cache_write_tokens bigint check (cache_write_tokens is null or cache_write_tokens >= 0);

-- Keep the previous signature during rolling deployment so the currently
-- deployed API can continue settling requests until the new server is live.
create function public.glow_settle_token_usage(
  p_request uuid,
  p_input bigint,
  p_output bigint,
  p_total bigint,
  p_failed boolean,
  p_cost numeric,
  p_cache_read bigint,
  p_cache_write bigint
) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_cost is not null and (p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid cost'; end if;
  if (p_cache_read is not null and p_cache_read<0) or (p_cache_write is not null and p_cache_write<0) then raise exception 'Invalid cache usage'; end if;

  perform public.glow_settle_tokens(p_request,p_input,p_output,p_total,p_failed);
  if p_cost is not null then
    update public.glow_token_requests set cost_usd=p_cost where id=p_request and status='settled' and cost_usd is null;
  end if;
  if p_cache_read is not null or p_cache_write is not null then
    update public.glow_token_requests
      set cache_read_tokens=p_cache_read, cache_write_tokens=p_cache_write
      where id=p_request and status='settled' and cache_read_tokens is null and cache_write_tokens is null;
  end if;
end;
$$;

revoke all on function public.glow_settle_token_usage(uuid,bigint,bigint,bigint,boolean,numeric,bigint,bigint) from public,anon,authenticated;
grant execute on function public.glow_settle_token_usage(uuid,bigint,bigint,bigint,boolean,numeric,bigint,bigint) to service_role;

commit;
