# Database

## D1

D1 stores operational messaging data:

- conversations
- messages
- message_statuses
- message_attachments
- channel_accounts
- conversation_assignments
- conversation_tags
- conversation_stage_history
- outbox_messages
- webhook_events
- followup_jobs
- followup_attempts
- human_handoffs
- realtime_events

## Supabase

Supabase stores product, customer, user and intelligence data:

- profiles
- user_roles
- store_settings
- products
- product_variants
- categories
- catalog_product_facts
- catalog_product_embeddings
- customers
- customer_memory
- orders and payments
- agent decision logs

Never store secrets in either database.
