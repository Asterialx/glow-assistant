begin;

create function public.glow_admin_invites()
returns table(email text, claimed_by uuid, expires_at timestamptz, accepted boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;

  return query
    select i.email, i.claimed_by, i.expires_at, coalesce(p.onboarding_completed, false)
    from public.glow_invites i
    left join public.glow_profiles p on p.user_id = i.claimed_by
    order by i.created_at desc;
end;
$$;

revoke all on function public.glow_admin_invites() from public, anon;
grant execute on function public.glow_admin_invites() to authenticated;

commit;
