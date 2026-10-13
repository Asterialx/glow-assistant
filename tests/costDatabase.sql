begin;
do $$
declare owner_id uuid; request_id uuid:=gen_random_uuid();
begin
 select user_id into owner_id from public.glow_access where role='admin' and active limit 1;
 if has_function_privilege('authenticated','public.glow_settle_token_usage(uuid,bigint,bigint,bigint,boolean,numeric)','EXECUTE') then raise exception 'Client cost writes allowed'; end if;
 if public.glow_reserve_tokens(owner_id,request_id,10000,'cost-qa')<>'accepted' then raise exception 'Reservation failed'; end if;
 perform public.glow_settle_token_usage(request_id,20,3,23,false,0.000123);
 perform public.glow_settle_token_usage(request_id,20,3,23,false,0.9);
 if (select cost_usd from public.glow_token_requests where id=request_id)<>0.000123 then raise exception 'Cost not exact/idempotent'; end if;
 begin
   perform public.glow_settle_token_usage(request_id,20,3,23,false,-1);
   raise exception 'Negative cost accepted';
 exception when others then
   if sqlerrm<>'Invalid cost' then raise; end if;
 end;
end $$;
rollback;
select 'PASS: protected server cost writes, exact decimal cost, idempotence, invalid cost refused; rolled back' as result;
