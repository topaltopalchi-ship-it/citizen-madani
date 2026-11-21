import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const readMigration = (name) => readFile(new URL(name, migrationsDir), 'utf8');

test('Supabase migrations have unique, chronological version prefixes', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql'));
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, 'migration filenames must already be chronological');
  const versions = files.map((name) => name.split('_')[0]);
  assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');
  assert.equal(files.length, 17, 'README setup checklist currently expects seventeen migrations');
});

test('attachment metadata validation is bound to the authenticated sender and recipient path', async () => {
  const sql = await readMigration('20261121180000_multi_attachment_storage_rls.sql');
  assert.match(sql, /function public\.owns_employee_message_attachments\s*\(/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /p_sender_id\s*<>\s*auth\.uid\(\)/i);
  assert.match(sql, /jsonb_typeof\(p_attachments\)\s*<>\s*'array'/i);
  assert.match(sql, /jsonb_array_length\(p_attachments\)\s*>\s*5/i);
  assert.match(sql, /v_total_size\s*>\s*10485760/i);
  assert.match(sql, /o\.owner_id\s*=\s*auth\.uid\(\)::text/i);
  assert.match(sql, /revoke all on function public\.owns_employee_message_attachments/i);
});

test('storage reads are limited to message participants and referenced attachments', async () => {
  const sql = await readMigration('20261121180000_multi_attachment_storage_rls.sql');
  assert.match(sql, /create policy "Message participants read attachments"[\s\S]*?dm\.sender_id\s*=\s*auth\.uid\(\) or dm\.recipient_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /dm\.attachment_path\s*=\s*storage\.objects\.name/i);
  assert.match(sql, /jsonb_array_elements\([\s\S]*?dm\.attachments/i);
});

test('orphan attachment deletion checks both legacy and multi-file references', async () => {
  const sql = await readMigration('20261121180000_multi_attachment_storage_rls.sql');
  const policy = sql.split('create policy "Message sender deletes own orphan attachments"')[1] ?? '';
  assert.match(policy, /storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i);
  assert.match(policy, /dm\.attachment_path\s*=\s*storage\.objects\.name/i);
  assert.match(policy, /jsonb_array_elements\([\s\S]*?dm\.attachments/i);
});

test('shift-swap status decisions are written to the administrative audit log', async () => {
  const sql = await readMigration('20261121190000_shift_swap_audit.sql');
  assert.match(sql, /'shift_change_requests'/i);
  assert.match(sql, /'shift_swap_approved'/i);
  assert.match(sql, /'shift_swap_rejected'/i);
  assert.match(sql, /create trigger shift_change_requests_admin_audit[\s\S]*?after update of status/i);
  assert.match(sql, /insert into public\.admin_audit_log/i);
});

test('inactive employees cannot read or delete private message attachments', async () => {
  const sql = await readMigration('20261121200000_active_employee_storage_access.sql');
  const readPolicy = sql.split('create policy "Message participants read attachments"')[1]?.split(';')[0] ?? '';
  const deletePolicy = sql.split('create policy "Message sender deletes own orphan attachments"')[1] ?? '';
  assert.match(readPolicy, /public\.is_citizen_madani_active_employee\(\)/i);
  assert.match(deletePolicy, /public\.is_citizen_madani_active_employee\(\)/i);
  assert.match(sql, /drop policy if exists "Message participants read attachments"/i);
  assert.match(sql, /drop policy if exists "Message sender deletes own orphan attachments"/i);
});

test('same-slot shift swaps defer uniqueness checks and lock rows deterministically', async () => {
  const sql = await readMigration('20261121210000_safe_shift_swap_constraint.sql');
  assert.match(sql, /alter constraint work_shift_employee_slot_unique\s+deferrable initially immediate/i);
  assert.match(sql, /set constraints public\.work_shift_employee_slot_unique deferred/i);
  assert.match(sql, /set search_path = ''[\s\S]*?set constraints public\.work_shift_employee_slot_unique deferred/i);
  assert.match(sql, /where id in \(new\.from_shift_id, new\.to_shift_id\)\s+order by id\s+for update/i);
  assert.match(sql, /set employee_id = case[\s\S]*?where id in \(new\.from_shift_id, new\.to_shift_id\)/i);
  assert.match(sql, /public\.is_citizen_madani_admin\(\)/i);
});
