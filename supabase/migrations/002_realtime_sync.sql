-- Enable Realtime for live chat sync across devices.
-- Run once in Supabase → SQL Editor (safe to re-run).

do $$
begin
  begin
    alter publication supabase_realtime add table public.sync_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sync_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sync_artifacts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sync_prefs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sync_memory;
  exception when duplicate_object then null;
  end;
end $$;
