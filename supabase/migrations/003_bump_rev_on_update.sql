-- Bump `rev` on every UPDATE so devices polling `.gt("rev", cursor)` receive edits
-- (e.g. assistant message content after streaming finishes).
-- Run in Supabase → SQL Editor (safe to re-run).

create or replace function public.glow_bump_sync_rev()
returns trigger
language plpgsql
as $$
declare
  seq text;
begin
  seq := pg_get_serial_sequence(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'rev');
  if seq is not null then
    new.rev := nextval(seq);
  end if;
  return new;
end;
$$;

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
    execute format('drop trigger if exists glow_bump_sync_rev on public.%I', t);
    execute format(
      'create trigger glow_bump_sync_rev before update on public.%I
       for each row execute function public.glow_bump_sync_rev()',
      t
    );
  end loop;
end $$;
