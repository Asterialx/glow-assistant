begin;

-- inviteUserByEmail creates the auth user (and glow_access via accept_invite) before the email is read.
-- Treat such users as pending invitations until they open the link (email_confirmed_at is set then).

drop function if exists public.glow_admin_invites();
create function public.glow_admin_invites()
returns table(email text, claimed_by uuid, expires_at timestamptz, accepted boolean, confirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select i.email, i.claimed_by, i.expires_at, coalesce(p.onboarding_completed, false), u.email_confirmed_at is not null
    from public.glow_invites i
    left join public.glow_profiles p on p.user_id = i.claimed_by
    left join auth.users u on u.id = i.claimed_by
    order by i.created_at desc;
end;
$$;
revoke all on function public.glow_admin_invites() from public, anon;
grant execute on function public.glow_admin_invites() to authenticated;

create or replace function public.glow_admin_members()
returns table(user_id uuid,email text,role text,active boolean,balance bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not glow_private.is_admin() then raise exception 'Administrator access required'; end if;
  return query select a.user_id,a.email,a.role,a.active,coalesce(sum(l.amount),0)::bigint
    from public.glow_access a
    join auth.users u on u.id = a.user_id and (u.email_confirmed_at is not null or a.role = 'admin')
    left join public.glow_credit_ledger l on l.user_id = a.user_id
    group by a.user_id,a.email,a.role,a.active order by a.created_at;
end;
$$;

commit;
