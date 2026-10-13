begin;
-- Invoker security preserves RLS; every statement explicitly scopes the owner.
create function public.glow_delete_conversation(p_scope text,p_conversation text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.glow_access where user_id=auth.uid() and active) then
   raise exception 'Access denied';
 end if;
 perform 1 from public.glow_data_conversations where user_id=auth.uid()
   and scope=p_scope and id=p_conversation for update;
 if not found then raise exception 'Conversation not found'; end if;
 delete from public.glow_data_ui_widgets where user_id=auth.uid() and scope=p_scope
   and message_id in (select id from public.glow_data_messages where user_id=auth.uid()
     and scope=p_scope and conversation_id=p_conversation);
 delete from public.glow_data_artifact_revisions where user_id=auth.uid() and scope=p_scope
   and artifact_id in (select id from public.glow_data_artifacts where user_id=auth.uid()
     and scope=p_scope and conversation_id=p_conversation);
 delete from public.glow_data_attachments where user_id=auth.uid() and scope=p_scope and conversation_id=p_conversation;
 delete from public.glow_data_artifacts where user_id=auth.uid() and scope=p_scope and conversation_id=p_conversation;
 delete from public.glow_data_messages where user_id=auth.uid() and scope=p_scope and conversation_id=p_conversation;
 delete from public.glow_data_conversations where user_id=auth.uid() and scope=p_scope and id=p_conversation;
end; $$;
revoke all on function public.glow_delete_conversation(text,text) from public,anon;
grant execute on function public.glow_delete_conversation(text,text) to authenticated;
commit;
