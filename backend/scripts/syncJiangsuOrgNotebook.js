#!/usr/bin/env node
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  ensureJiangsuOrgTables,
  nowIsoDate,
  syncJiangsuOrgNotebook,
} = require('../jiangsuOrgNotebook');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: process.env.DB_PASSWORD || '',
});

async function main() {
  const hcmDate = process.argv[2] || process.env.HCM_SYNC_DATE || nowIsoDate();
  const ownerEmail = process.env.ADMIN_EMAIL || '767493611@qq.com';
  await ensureJiangsuOrgTables(pool);
  const result = await syncJiangsuOrgNotebook(pool, { ownerEmail, hcmDate });
  console.log(JSON.stringify({
    ok: true,
    hcmDate,
    fetched: result.fetched,
    active: result.active,
    archived: result.archived,
    created: result.created,
    moved: result.moved,
    renamed: result.renamed,
    projectLocationAiResolved: result.projectLocationAiResolved || 0,
    projectLocationUnknown: result.projectLocationUnknown || 0,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }));
  process.exitCode = 1;
}).finally(() => pool.end());
