-- SQL Editor only. Test allowances and usage are fully rolled back.
begin;
do $$
declare owner_id uuid; grant_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); pending_id uuid:=gen_random_uuid(); initial_used bigint; summary jsonb;
begin
 select user_id into owner_id from public.glow_access where role='admin' and active limit 1;
 if owner_id is null then raise exception 'Active admin required'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 if has_function_privilege('authenticated','public.glow_reserve_tokens(uuid,uuid,integer,text)','EXECUTE')
 or has_function_privilege('anon','public.glow_token_summary()','EXECUTE') then raise exception 'Unsafe token RPC grants'; end if;
 select used into initial_used from public.glow_token_wallets where user_id=owner_id;
 perform public.glow_admin_token_grant(owner_id,100000,'Rollback-only token QA',grant_id);
 perform public.glow_admin_token_grant(owner_id,100000,'Rollback-only token QA',grant_id);
 if (select count(*) from public.glow_token_grants where id=grant_id)<>1 then raise exception 'Duplicate grant'; end if;
 if public.glow_reserve_tokens(owner_id,request_id,10000,'qa')<>'accepted' then raise exception 'Reservation rejected'; end if;
 summary:=public.glow_token_summary();
 if (summary->>'reserved')::bigint<>10000 then raise exception 'Reservation incorrect'; end if;
 perform public.glow_settle_tokens(request_id,120,13,133,false);
 perform public.glow_settle_tokens(request_id,120,13,133,false);
 if (select used from public.glow_token_wallets where user_id=owner_id)<>initial_used+133 then raise exception 'Usage not exact/idempotent'; end if;
 if public.glow_reserve_tokens(owner_id,pending_id,5000,'qa')<>'accepted' then raise exception 'Second reservation rejected'; end if;
 perform public.glow_settle_tokens(pending_id,null,null,null,false);
 summary:=public.glow_token_summary();
 if (summary->>'reserved')::bigint<>5000 or (summary->>'used')::bigint<>initial_used+133 then raise exception 'Pending usage was invented'; end if;
 perform public.glow_settle_tokens(pending_id,0,0,0,true);
 if (public.glow_token_summary()->>'reserved')::bigint<>0 then raise exception 'Failed request held tokens'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
   perform public.glow_admin_token_grant(owner_id,1,'Unauthorized',gen_random_uuid());
   raise exception 'Non-admin grant allowed';
 exception when others then
   if sqlerrm<>'Administrator required' then raise; end if;
 end;
end $$;
rollback;
select 'PASS: protected RPC, 100000 grant, duplicate protection, exact 120+13=133 debit, pending reserve separate, failed reserve released, non-admin refused; all writes rolled back' as result;
