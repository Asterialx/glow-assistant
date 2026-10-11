-- Cloud data belongs to auth.uid(); no cross-account admin reads.
begin;
create table public.glow_data_projects (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , name text NOT NULL, system_prompt text NOT NULL DEFAULT '',
  created_at bigint NOT NULL, updated_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_projects enable row level security;
revoke all on public.glow_data_projects from anon, authenticated;
grant select, insert, update, delete on public.glow_data_projects to authenticated;
create policy own_active_data on public.glow_data_projects for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_conversations (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , project_id text, title text NOT NULL DEFAULT 'New chat',
  active_leaf_id text, created_at bigint NOT NULL, updated_at bigint NOT NULL,
  pinned bigint NOT NULL DEFAULT 0, unread bigint NOT NULL DEFAULT 0,
 primary key(user_id,scope,id)
);
alter table public.glow_data_conversations enable row level security;
revoke all on public.glow_data_conversations from anon, authenticated;
grant select, insert, update, delete on public.glow_data_conversations to authenticated;
create policy own_active_data on public.glow_data_conversations for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_messages (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , conversation_id text NOT NULL, parent_id text,
  role text NOT NULL, content text NOT NULL DEFAULT '', model_id text,
  status text NOT NULL DEFAULT 'done', created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_messages enable row level security;
revoke all on public.glow_data_messages from anon, authenticated;
grant select, insert, update, delete on public.glow_data_messages to authenticated;
create policy own_active_data on public.glow_data_messages for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_ui_widgets (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , message_id text NOT NULL, widget_type text NOT NULL,
  state_json text NOT NULL DEFAULT '{}', updated_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_ui_widgets enable row level security;
revoke all on public.glow_data_ui_widgets from anon, authenticated;
grant select, insert, update, delete on public.glow_data_ui_widgets to authenticated;
create policy own_active_data on public.glow_data_ui_widgets for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_attachments (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , message_id text, conversation_id text NOT NULL,
  file_name text NOT NULL, mime_type text, local_path text NOT NULL,
  size_bytes bigint, created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_attachments enable row level security;
revoke all on public.glow_data_attachments from anon, authenticated;
grant select, insert, update, delete on public.glow_data_attachments to authenticated;
create policy own_active_data on public.glow_data_attachments for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_artifacts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , conversation_id text NOT NULL, message_id text,
  kind text NOT NULL, title text, content_path text, content_text text,
  meta_json text NOT NULL DEFAULT '{}', created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_artifacts enable row level security;
revoke all on public.glow_data_artifacts from anon, authenticated;
grant select, insert, update, delete on public.glow_data_artifacts to authenticated;
create policy own_active_data on public.glow_data_artifacts for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_artifact_revisions (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , artifact_id text NOT NULL, revision_number bigint NOT NULL,
  kind text NOT NULL, title text, content_path text, content_text text,
  meta_json text NOT NULL DEFAULT '{}', created_at bigint NOT NULL, source_message_id text,
 primary key(user_id,scope,id)
);
alter table public.glow_data_artifact_revisions enable row level security;
revoke all on public.glow_data_artifact_revisions from anon, authenticated;
grant select, insert, update, delete on public.glow_data_artifact_revisions to authenticated;
create policy own_active_data on public.glow_data_artifact_revisions for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_domain_records (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , record_type text NOT NULL, payload_json text NOT NULL,
  created_at bigint NOT NULL, updated_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_domain_records enable row level security;
revoke all on public.glow_data_domain_records from anon, authenticated;
grant select, insert, update, delete on public.glow_data_domain_records to authenticated;
create policy own_active_data on public.glow_data_domain_records for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_project_files (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , project_id text NOT NULL, path text NOT NULL,
  label text, created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_project_files enable row level security;
revoke all on public.glow_data_project_files from anon, authenticated;
grant select, insert, update, delete on public.glow_data_project_files to authenticated;
create policy own_active_data on public.glow_data_project_files for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_app_settings (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 key text , value_json text NOT NULL,
 primary key(user_id,scope,key)
);
alter table public.glow_data_app_settings enable row level security;
revoke all on public.glow_data_app_settings from anon, authenticated;
grant select, insert, update, delete on public.glow_data_app_settings to authenticated;
create policy own_active_data on public.glow_data_app_settings for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_model_catalog (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , display_name text NOT NULL, provider text NOT NULL DEFAULT 'smartapi',
  cost_multiplier double precision, cost_per_image bigint, tier text NOT NULL, use_case text NOT NULL,
  sort_order bigint NOT NULL DEFAULT 0, enabled bigint NOT NULL DEFAULT 1,
 primary key(user_id,scope,id)
);
alter table public.glow_data_model_catalog enable row level security;
revoke all on public.glow_data_model_catalog from anon, authenticated;
grant select, insert, update, delete on public.glow_data_model_catalog to authenticated;
create policy own_active_data on public.glow_data_model_catalog for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_token_usage (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , mode text NOT NULL, conversation_id text, message_id text,
  model_id text NOT NULL, input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0, cost_units double precision NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_token_usage enable row level security;
revoke all on public.glow_data_token_usage from anon, authenticated;
grant select, insert, update, delete on public.glow_data_token_usage to authenticated;
create policy own_active_data on public.glow_data_token_usage for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_global_memory (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , fact text NOT NULL, source_mode text, confidence double precision DEFAULT 1.0,
  created_at bigint NOT NULL, updated_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_global_memory enable row level security;
revoke all on public.glow_data_global_memory from anon, authenticated;
grant select, insert, update, delete on public.glow_data_global_memory to authenticated;
create policy own_active_data on public.glow_data_global_memory for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_game_mode_events (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , process_name text NOT NULL, action text NOT NULL, created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_game_mode_events enable row level security;
revoke all on public.glow_data_game_mode_events from anon, authenticated;
grant select, insert, update, delete on public.glow_data_game_mode_events to authenticated;
create policy own_active_data on public.glow_data_game_mode_events for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
create table public.glow_data_mcp_servers (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check(scope in ('meta','home','code','study','med')),
 
  id text , name text NOT NULL, transport text NOT NULL DEFAULT 'stdio',
  command_or_url text NOT NULL, args_json text NOT NULL DEFAULT '[]',
  enabled bigint NOT NULL DEFAULT 0, category text NOT NULL DEFAULT 'general',
  created_at bigint NOT NULL,
 primary key(user_id,scope,id)
);
alter table public.glow_data_mcp_servers enable row level security;
revoke all on public.glow_data_mcp_servers from anon, authenticated;
grant select, insert, update, delete on public.glow_data_mcp_servers to authenticated;
create policy own_active_data on public.glow_data_mcp_servers for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active))
 with check(user_id=auth.uid() and exists(select 1 from public.glow_access where user_id=auth.uid() and active));
commit;

