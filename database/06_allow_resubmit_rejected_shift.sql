-- Allow employees to resubmit their own rejected shift as pending.
-- Apply after the V2 schema; this does not change manager permissions.
drop policy if exists shifts_resubmit_rejected on public.shifts;

create policy shifts_resubmit_rejected
on public.shifts for update to authenticated
using (
  user_id = (select auth.uid())
  and status = 'rejected'
)
with check (
  user_id = (select auth.uid())
  and status = 'pending'
);
