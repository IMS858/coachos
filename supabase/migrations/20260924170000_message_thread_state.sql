-- Staff-controlled message inbox state.
-- Keeps message content immutable while allowing a conversation to be archived/cleared
-- from the owner's working inbox without deleting history.
create table if not exists public.message_thread_state (
  client_id uuid primary key references public.clients(id) on delete cascade,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.message_thread_state enable row level security;
drop policy if exists message_thread_state_staff_all on public.message_thread_state;
create policy message_thread_state_staff_all on public.message_thread_state for all to authenticated
  using (public.is_owner() or public.is_trainer())
  with check (public.is_owner() or public.is_trainer());
revoke all on public.message_thread_state from anon;
grant select,insert,update,delete on public.message_thread_state to authenticated;
