-- Account change counters: small polling payload, no full history resync.
begin;
create table public.glow_data_versions(user_id uuid not null references auth.users(id) on delete cascade,scope text not null,revision bigint not null default 0,primary key(user_id,scope));
alter table public.glow_data_versions enable row level security;
revoke all on public.glow_data_versions from anon,authenticated;
grant select on public.glow_data_versions to authenticated;
create policy own_version on public.glow_data_versions for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create function glow_private.bump_data_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.glow_data_versions(user_id,scope,revision) values(coalesce(new.user_id,old.user_id),coalesce(new.scope,old.scope),1) on conflict(user_id,scope) do update set revision=public.glow_data_versions.revision+1;
 return coalesce(new,old);
end; $$;
revoke all on function glow_private.bump_data_version() from public;
create trigger glow_bump_projects after insert or update or delete on public.glow_data_projects for each row execute function glow_private.bump_data_version();
create trigger glow_bump_conversations after insert or update or delete on public.glow_data_conversations for each row execute function glow_private.bump_data_version();
create trigger glow_bump_messages after insert or update or delete on public.glow_data_messages for each row execute function glow_private.bump_data_version();
create trigger glow_bump_ui_widgets after insert or update or delete on public.glow_data_ui_widgets for each row execute function glow_private.bump_data_version();
create trigger glow_bump_attachments after insert or update or delete on public.glow_data_attachments for each row execute function glow_private.bump_data_version();
create trigger glow_bump_artifacts after insert or update or delete on public.glow_data_artifacts for each row execute function glow_private.bump_data_version();
create trigger glow_bump_artifact_revisions after insert or update or delete on public.glow_data_artifact_revisions for each row execute function glow_private.bump_data_version();
create trigger glow_bump_domain_records after insert or update or delete on public.glow_data_domain_records for each row execute function glow_private.bump_data_version();
create trigger glow_bump_project_files after insert or update or delete on public.glow_data_project_files for each row execute function glow_private.bump_data_version();
create trigger glow_bump_app_settings after insert or update or delete on public.glow_data_app_settings for each row execute function glow_private.bump_data_version();
create trigger glow_bump_model_catalog after insert or update or delete on public.glow_data_model_catalog for each row execute function glow_private.bump_data_version();
create trigger glow_bump_token_usage after insert or update or delete on public.glow_data_token_usage for each row execute function glow_private.bump_data_version();
create trigger glow_bump_global_memory after insert or update or delete on public.glow_data_global_memory for each row execute function glow_private.bump_data_version();
create trigger glow_bump_game_mode_events after insert or update or delete on public.glow_data_game_mode_events for each row execute function glow_private.bump_data_version();
create trigger glow_bump_mcp_servers after insert or update or delete on public.glow_data_mcp_servers for each row execute function glow_private.bump_data_version();
commit;

