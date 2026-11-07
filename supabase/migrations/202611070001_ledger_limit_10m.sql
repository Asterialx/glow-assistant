begin;

-- 202610220001 raised invitations to 10 000 000 tokens but left the ledger check at 1 000 000,
-- so accepting an invitation above 1 000 000 failed inside the auth.users trigger and Supabase
-- refused to send the invitation email.
alter table public.glow_credit_ledger drop constraint if exists glow_credit_ledger_amount_check;
alter table public.glow_credit_ledger add constraint glow_credit_ledger_amount_check
  check (amount <> 0 and amount between -10000000 and 10000000);

commit;
