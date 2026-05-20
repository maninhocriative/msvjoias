-- Speed up CRM chat initial load and recent message fetches.
create index if not exists idx_messages_conversation_created_at_desc
on public.messages (conversation_id, created_at desc);

create index if not exists idx_aline_messages_conversation_created_at_desc
on public.aline_messages (conversation_id, created_at desc);

create index if not exists idx_conversations_contact_number_created_at_desc
on public.conversations (contact_number, created_at desc);

create index if not exists idx_aline_conversations_phone_created_at_desc
on public.aline_conversations (phone, created_at desc);

create index if not exists idx_conversations_last_message_created_at_desc
on public.conversations (last_message_at desc nulls last, created_at desc);