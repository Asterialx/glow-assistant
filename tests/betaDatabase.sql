-- Run only in the Glow project's SQL Editor. All changes roll back.
begin;
do $$
declare account_id uuid; request_id uuid:=gen_random_uuid(); reply text; n integer; before_balance bigint;
begin
 if has_function_privilege('authenticated','public.glow_admit_ai_request(uuid,uuid)','EXECUTE')
 or has_function_privilege('anon','public.glow_admit_ai_request(uuid,uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.glow_admit_ai_request(uuid,uuid)','EXECUTE') then
   raise exception 'Budget RPC grants invalid'; end if;
 if has_function_privilege('anon','public.glow_delete_conversation(text,text)','EXECUTE') then
   raise exception 'Anonymous delete allowed'; end if;
 select user_id into account_id from public.glow_access where active and role='admin' limit 1;
 if account_id is null then raise exception 'Active admin required'; end if;
 insert into public.glow_credit_ledger(user_id,amount,reason,request_id)
 values(account_id,10,'Rollback-only QA allowance',gen_random_uuid());
 select coalesce(sum(amount),0) into before_balance from public.glow_credit_ledger where user_id=account_id;
 update glow_private.ai_budget set enabled=true,daily_requests=10000 where id=true;
 reply:=public.glow_admit_ai_request(account_id,request_id);
 if reply<>'accepted' then raise exception 'First admission: %',reply; end if;
 if (select sum(amount) from public.glow_credit_ledger where user_id=account_id)<>before_balance-1 then
   raise exception 'Debit incorrect'; end if;
 if public.glow_admit_ai_request(account_id,gen_random_uuid())<>'concurrent' then
   raise exception 'Concurrent admission allowed'; end if;
 perform public.glow_finish_ai_request(request_id);
 if public.glow_admit_ai_request(account_id,request_id)<>'concurrent' then
   raise exception 'Duplicate admission allowed'; end if;
 select count(*) into n from glow_private.ai_requests where created_at>=
   date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 update glow_private.ai_budget set daily_requests=n where id=true;
 if public.glow_admit_ai_request(account_id,gen_random_uuid())<>'budget' then
   raise exception 'Daily cap ignored'; end if;
 update glow_private.ai_budget set enabled=false where id=true;
 if public.glow_admit_ai_request(account_id,gen_random_uuid())<>'disabled' then
   raise exception 'Emergency stop ignored'; end if;
 perform set_config('request.jwt.claim.sub',account_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',account_id,'role','authenticated')::text,true);
 insert into public.glow_data_conversations(user_id,scope,id,title,created_at,updated_at)
 values(account_id,'home','qa-rollback-chat','Disposable transactional QA',1,1);
 insert into public.glow_data_messages(user_id,scope,id,conversation_id,role,content,status,created_at)
 values(account_id,'home','qa-rollback-message','qa-rollback-chat','user','QA','done',1);
 insert into public.glow_data_ui_widgets(user_id,scope,id,message_id,widget_type,state_json,updated_at)
 values(account_id,'home','qa-rollback-widget','qa-rollback-message','calculator','{}',1);
 perform public.glow_delete_conversation('home','qa-rollback-chat');
 if exists(select 1 from public.glow_data_conversations where user_id=account_id and scope='home' and id='qa-rollback-chat')
 or exists(select 1 from public.glow_data_messages where user_id=account_id and scope='home' and id='qa-rollback-message')
 or exists(select 1 from public.glow_data_ui_widgets where user_id=account_id and scope='home' and id='qa-rollback-widget') then
   raise exception 'Dependent records remain'; end if;
end $$;
rollback;
select 'PASS: grants, debit, duplicate/concurrent rejection, daily cap, emergency stop, chat/widget delete; all test writes rolled back' as result;
