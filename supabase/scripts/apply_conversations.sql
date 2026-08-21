-- Apply in Supabase SQL Editor (idempotent).
-- Creates conversations + messages for in-app chat.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  landlord_user_id uuid not null references profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  student_last_read_at timestamptz,
  landlord_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, student_id)
);

create index if not exists idx_conversations_student
  on conversations(student_id, last_message_at desc);
create index if not exists idx_conversations_landlord
  on conversations(landlord_user_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation
  on messages(conversation_id, created_at asc);

alter table conversations enable row level security;
alter table messages enable row level security;

drop policy if exists conversations_participant_select on conversations;
create policy conversations_participant_select on conversations
  for select using (student_id = auth.uid() or landlord_user_id = auth.uid());

drop policy if exists messages_participant_select on messages;
create policy messages_participant_select on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.student_id = auth.uid() or c.landlord_user_id = auth.uid())
    )
  );
