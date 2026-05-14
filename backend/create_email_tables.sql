CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  imap_host TEXT NOT NULL,
  imap_port INTEGER DEFAULT 993,
  imap_ssl BOOLEAN DEFAULT true,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER DEFAULT 465,
  smtp_ssl BOOLEAN DEFAULT true,
  encrypted_password TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT,
  last_sync_uid BIGINT DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email_address)
);

CREATE TABLE IF NOT EXISTS email_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  uid BIGINT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'INBOX',
  message_id TEXT,
  from_addr TEXT,
  from_name TEXT,
  to_list TEXT,
  cc_list TEXT,
  subject TEXT,
  date TIMESTAMPTZ,
  has_attachments BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, uid, folder)
);

CREATE TABLE IF NOT EXISTS email_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  other_addr TEXT NOT NULL,
  other_name TEXT DEFAULT '',
  last_email_date TIMESTAMPTZ,
  last_subject TEXT DEFAULT '',
  unread_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  note_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, other_addr)
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_index_account ON email_index(account_id);
CREATE INDEX IF NOT EXISTS idx_email_index_from ON email_index(from_addr);
CREATE INDEX IF NOT EXISTS idx_email_index_date ON email_index(date DESC);
CREATE INDEX IF NOT EXISTS idx_email_conversations_account ON email_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_date ON email_conversations(last_email_date DESC);
