-- Tokens the provider serves from its prompt cache cost about a tenth of normal input (checked against
-- cost_usd in glow_token_requests), so a wallet is charged 10% of them. The request row keeps the raw
-- input and cache_read_tokens for reconciliation; only the wallet's `used` is reduced, and only on the
-- first settlement of a request, so a retried settle cannot refund twice.
begin;

create or replace function public.glow_settle_token_usage(
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
declare first_settle boolean; owner uuid;
begin
  if p_cost is not null and (p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid cost'; end if;
  if (p_cache_read is not null and p_cache_read<0) or (p_cache_write is not null and p_cache_write<0) then raise exception 'Invalid cache usage'; end if;

  perform public.glow_settle_tokens(p_request,p_input,p_output,p_total,p_failed);
  if p_cost is not null then
    update public.glow_token_requests set cost_usd=p_cost where id=p_request and status='settled' and cost_usd is null;
  end if;
  if p_cache_read is not null or p_cache_write is not null then
    select user_id, (cache_read_tokens is null and cache_write_tokens is null) into owner, first_settle
      from public.glow_token_requests where id=p_request and status='settled';
    update public.glow_token_requests
      set cache_read_tokens=p_cache_read, cache_write_tokens=p_cache_write
      where id=p_request and status='settled' and cache_read_tokens is null and cache_write_tokens is null;
    if first_settle and owner is not null and coalesce(p_cache_read,0)>0 then
      update public.glow_token_wallets set used=greatest(0, used-least(floor(p_cache_read*0.9)::bigint, p_input)) where user_id=owner;
    end if;
  end if;
end;
$$;

commit;
