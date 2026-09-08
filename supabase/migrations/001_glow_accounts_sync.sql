-- Glow Assistant: accounts sync + guest trial (Supabase / Postgres)
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists "pgcrypto";

-- ---------- Guest trial (device-scoped, no auth) ----------
create table if not exists public.trial_usage (
  device_id text primary key,
  message_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.trial_usage enable row level security;

-- Anon clients may only bump/read their own device row via RPC below.
drop policy if exists trial_usage_deny_all on public.trial_usage;
create policy trial_usage_deny_all on public.trial_usage
  for all using (false) with check (false);

create or replace function public.trial_ping(p_device_id text, p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_device_id is null or length(trim(p_device_id)) < 8 then
    raise exception 'invalid device id';
  end if;

  insert into public.trial_usage (device_id, message_count, first_seen_at, last_seen_at)
  values (p_device_id, 0, now(), now())
  on conflict (device_id) do nothing;

  update public.trial_usage
  set message_count = message_count + 1,
      last_seen_at = now()
  where device_id = p_device_id
  returning message_count into v_count;

  return jsonb_build_object(
    'count', v_count,
    'limit', p_limit,
    'blocked', v_count > p_limit
  );
end;
$$;

revoke all on function public.trial_ping(text, integer) from public;
grant execute on function public.trial_ping(text, integer) to anon, authenticated;

-- ---------- Sync tables ----------
-- Generic shape: id is client UUID, user_id from auth.uid(), rev for incremental pull,
-- deleted_at for tombstones, updated_at for LWW on push.

create table if not exists public.sync_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null default '',
  system_prompt text not null default '',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_projects_rev_idx on public.sync_projects (user_id, rev);

create table if not exists public.sync_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  project_id text,
  title text not null default 'New chat',
  active_leaf_id text,
  created_at bigint not null,
  updated_at bigint not null,
  pinned integer not null default 0,
  unread integer not null default 0,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_conversations_rev_idx on public.sync_conversations (user_id, rev);

create table if not exists public.sync_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  conversation_id text not null,
  parent_id text,
  role text not null,
  content text not null default '',
  model_id text,
  status text not null default 'done',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_messages_rev_idx on public.sync_messages (user_id, rev);
create index if not exists sync_messages_conv_idx on public.sync_messages (user_id, conversation_id);

create table if not exists public.sync_artifacts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  conversation_id text not null,
  message_id text,
  kind text not null,
  title text,
  content_path text,
  content_text text,
  meta_json text not null default '{}',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_artifacts_rev_idx on public.sync_artifacts (user_id, rev);

create table if not exists public.sync_widgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  message_id text not null,
  widget_type text not null,
  state_json text not null default '{}',
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_widgets_rev_idx on public.sync_widgets (user_id, rev);

create table if not exists public.sync_memory (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  fact text not null,
  source_mode text,
  confidence double precision default 1.0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, id)
);
create index if not exists sync_memory_rev_idx on public.sync_memory (user_id, rev);

create table if not exists public.sync_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null default '',
  updated_at bigint not null,
  deleted_at bigint,
  rev bigserial,
  primary key (user_id, key)
);
create index if not exists sync_prefs_rev_idx on public.sync_prefs (user_id, rev);

-- RLS: users only see their own rows
do $$
declare
  t text;
begin
  foreach t in array array[
    'sync_projects',
    'sync_conversations',
    'sync_messages',
    'sync_artifacts',
    'sync_widgets',
    'sync_memory',
    'sync_prefs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant usage, select on sequence public.%I_rev_seq to authenticated', t);
  end loop;
end $$;
