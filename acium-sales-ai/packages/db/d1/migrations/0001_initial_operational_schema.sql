PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_ref TEXT,
  channel TEXT NOT NULL,
  channel_conversation_id TEXT,
  channel_customer_id TEXT,
  customer_name TEXT,
  customer_avatar_url TEXT,
  current_agent TEXT,
  stage TEXT,
  status TEXT,
  human_takeover INTEGER DEFAULT 0,
  human_required INTEGER DEFAULT 0,
  automation_paused INTEGER DEFAULT 0,
  assigned_user_id TEXT,
  assigned_queue TEXT,
  handoff_reason TEXT,
  handoff_priority TEXT,
  handoff_summary TEXT,
  last_message_text TEXT,
  last_message_at TEXT,
  last_customer_message_at TEXT,
  last_agent_message_at TEXT,
  next_followup_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  agent_name TEXT,
  body TEXT,
  normalized_body TEXT,
  message_type TEXT NOT NULL,
  media_url TEXT,
  media_mime_type TEXT,
  media_storage_key TEXT,
  external_message_id TEXT,
  reply_to_message_id TEXT,
  status TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS message_statuses (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  attachment_type TEXT,
  content_hash TEXT,
  signed_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS channel_accounts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_assignments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT,
  queue TEXT,
  assigned_at TEXT NOT NULL,
  released_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS conversation_tags (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS conversation_stage_history (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  stage_from TEXT,
  stage_to TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  to_channel_customer_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  body TEXT,
  payload_json TEXT,
  status TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  scheduled_for TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT,
  external_event_id TEXT,
  payload_hash TEXT,
  payload_json TEXT,
  processed INTEGER DEFAULT 0,
  processing_error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS followup_jobs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  followup_type TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS followup_attempts (
  id TEXT PRIMARY KEY,
  followup_job_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  attempted_at TEXT NOT NULL,
  result_json TEXT,
  FOREIGN KEY (followup_job_id) REFERENCES followup_jobs(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS human_handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL,
  queue TEXT NOT NULL,
  summary TEXT,
  suggested_action TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_message_id
  ON messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_payload_hash
  ON webhook_events(payload_hash);

CREATE INDEX IF NOT EXISTS idx_conversations_channel_customer
  ON conversations(channel, channel_customer_id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_status_scheduled
  ON outbox_messages(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_followup_jobs_status_scheduled
  ON followup_jobs(status, scheduled_for);
