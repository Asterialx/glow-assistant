begin;
create table glow_private.generation_leases (
 user_id uuid not null, scope text not null, conversation_id text not null,
 token uuid not null, expires_at timestamptz not null,
 primary key(user_id,scope,conversation_id),
 foreign key(user_id,scope,conversation_id) references public.glow_data_conversations(user_id,scope,id) on delete cascade
);
alter table glow_private.generation_leases enable row level security;
revoke all on glow_private.generation_leases from public,anon,authenticated;
create function public.glow_acquire_generation(p_scope text,p_conversation text,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare acquired boolean;
begin
 if p_token is null or not exists(select 1 from public.glow_access where user_id=auth.uid() and active)
 or not exists(select 1 from public.glow_data_conversations where user_id=auth.uid() and scope=p_scope and id=p_conversation) then
 raise exception 'Conversation access denied'; end if;
 insert into glow_private.generation_leases(user_id,scope,conversation_id,token,expires_at)
 values(auth.uid(),p_scope,p_conversation,p_token,now()+interval '120 seconds')
 on conflict(user_id,scope,conversation_id) do update set token=excluded.token,expires_at=excluded.expires_at
 where glow_private.generation_leases.expires_at < now();
 acquired := found;
 return acquired;
end; $$;
create function public.glow_release_generation(p_scope text,p_conversation text,p_token uuid) returns void
language sql security definer set search_path='' as $$
 delete from glow_private.generation_leases where user_id=auth.uid() and scope=p_scope and conversation_id=p_conversation and token=p_token;
$$;
revoke all on function public.glow_acquire_generation(text,text,uuid),public.glow_release_generation(text,text,uuid) from public,anon;
grant execute on function public.glow_acquire_generation(text,text,uuid),public.glow_release_generation(text,text,uuid) to authenticated;
commit;
