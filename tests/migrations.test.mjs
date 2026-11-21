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
  assert.equal(files.length, 18, 'README setup checklist must match the migration count');
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
  assert.match(sql, /drop constraint work_shift_employee_slot_unique[\s\S]*?add constraint work_shift_employee_slot_unique\s+unique \(employee_id, shift_date, shift_type\)\s+deferrable initially immediate/i);
  assert.match(sql, /set constraints public\.work_shift_employee_slot_unique deferred/i);
  assert.match(sql, /set search_path = ''[\s\S]*?set constraints public\.work_shift_employee_slot_unique deferred/i);
  assert.match(sql, /where id in \(new\.from_shift_id, new\.to_shift_id\)\s+order by id\s+for update/i);
  assert.match(sql, /set employee_id = case[\s\S]*?where id in \(new\.from_shift_id, new\.to_shift_id\)/i);
  assert.match(sql, /public\.is_citizen_madani_admin\(\)/i);
});


test('shift scheduling defaults and past-date validation use the browser local calendar date', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const \[shiftDate, setShiftDate\] = useState\(\(\) => dateKey\(new Date\(\)\)\)/);
  assert.match(app, /shiftDate < dateKey\(new Date\(\)\)/);
  assert.match(app, /min=\{dateKey\(new Date\(\)\)\}/);
  assert.doesNotMatch(app, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(app, /gte\('shift_date', dateKey\(new Date\(new Date\(\)\.getFullYear\(\) - 1, new Date\(\)\.getMonth\(\), 1\)\)\)\.lte\('shift_date', dateKey\(new Date\(new Date\(\)\.getFullYear\(\) \+ 1, new Date\(\)\.getMonth\(\) \+ 1, 0\)\)\)/);
  assert.doesNotMatch(app, /shift_date'[^\n]*toISOString\(\)/);
});


test('private message attachment picker enforces count, size and type before upload', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const next = \[\.\.\.messageAttachments, \.\.\.picked\]/);
  assert.match(app, /if \(next\.length > 5\)/);
  assert.match(app, /total > 10 \* 1024 \* 1024/);
  assert.match(app, /picked\.some\(file => !allowed\.includes\(file\.type\) \|\| file\.size === 0\)/);
  assert.match(app, /setMessageAttachments\(next\)/);
});

test('replayed realtime message inserts do not duplicate inbox unread counts', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const seenIncomingMessageIds = useRef\(new Set<string>\(\)\)/);
  assert.match(app, /seenIncomingMessageIds\.current\.has\(incoming\.id\)/);
  assert.match(app, /seenIncomingMessageIds\.current\.add\(incoming\.id\)/);
  assert.match(app, /loadedInbox\.forEach\(item => \{ if \(item\.recipient_id === userId\) seenIncomingMessageIds\.current\.add\(item\.id\) \}\)/);
  assert.match(app, /seenIncomingMessageIds\.current\.clear\(\)/);
});

test('realtime read updates for received messages reconcile the unread count', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /filter: `recipient_id=eq\.\$\{profile\.id\}`[\s\S]*?Reconcile unread count with the database/);
  assert.match(app, /\.eq\('recipient_id', profile\.id\)[\s\S]*?\.is\('read_at', null\)[\s\S]*?\.is\('deleted_at', null\)/);
  assert.match(app, /if \(!countError\) setUnreadCount\(count \?\? 0\)/);
});

test('notification center uses persisted database notifications', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const activityNotifications = notifications/);
  assert.match(app, /page === 'مرکز اعلان‌ها'/);
  assert.match(app, /notification-center-trigger/);
  assert.match(app, /unreadNotificationCount/);
});

test('notification center filters persisted alerts by read state and category', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /notificationReadFilter/)
  assert.match(app, /notificationTypeFilter/)
  assert.match(app, /const visibleNotifications = useMemo/)
  assert.match(app, /visibleNotifications\.map\(item/)
  assert.match(app, /اعلانی با این فیلتر پیدا نشد/)
  assert.match(app, /پاک‌کردن فیلترها/)
})

test('employee notifications are durable, owner-scoped and trigger-generated', async () => {
  const sql = await readMigration('20261121220000_employee_notifications.sql');
  assert.match(sql, /create table if not exists public\.employee_notifications/i);
  assert.match(sql, /recipient_id uuid not null references public\.employee_profiles/i);
  assert.match(sql, /source_key text not null unique/i);
  assert.match(sql, /create policy "Employees read own notifications"[\s\S]*?recipient_id = auth\.uid\(\)/i);
  assert.match(sql, /create policy "Employees mark own notifications read"[\s\S]*?recipient_id = auth\.uid\(\)/i);
  assert.match(sql, /grant update \(read_at\) on public\.employee_notifications to authenticated/i);
  assert.match(sql, /revoke all privileges on public\.employee_notifications from public, anon, authenticated/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /after insert on public\.direct_messages/i);
  assert.match(sql, /after update of status on public\.exchange_requests/i);
  assert.match(sql, /after update of status on public\.shift_change_requests/i);
  assert.match(sql, /after update of is_published on public\.announcements/i);
  assert.match(sql, /on conflict \(source_key\) do nothing/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.employee_notifications/i);
});

test('notification center loads persisted notifications and syncs read state in realtime', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /from\('employee_notifications'\)\.select/);
  assert.match(app, /filter: `recipient_id=eq\.\$\{profile\.id\}`/);
  assert.match(app, /const markNotificationRead = async/);
  assert.match(app, /const markAllNotificationsRead = async/);
  assert.match(app, /\.update\(\{ read_at: readAt \}\)/);
  assert.match(app, /setNotifications\(current => current\.map/);
});


test('profile password change uses Supabase Auth and validates matching credentials', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.match(app, /newPassword\.length < 8/);
  assert.match(app, /newPassword !== confirmNewPassword/);
  assert.match(app, /type="password" autoComplete="new-password"/);
  assert.match(app, /account-security-panel/);
});


test('global sign-out revokes all Supabase sessions from profile security settings', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /supabase\.auth\.signOut\(\{ scope: 'global' \}\)/);
  assert.match(app, /خروج از همه دستگاه‌ها/);
  assert.match(app, /خروج از این دستگاه/);
});


test('profile displays account identity, role, organization, and active status', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /اطلاعات حساب/);
  assert.match(app, /مدیر سامانه/);
  assert.match(app, /profile\?\.department \|\| 'ثبت نشده'/);
  assert.match(app, /profile\?\.job_title \|\| 'ثبت نشده'/);
  assert.match(app, /profile\?\.is_active === false/);
  assert.match(app, /profile-details-grid/);
});


test('personal settings persist page, notification filter, and compact layout preferences', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /تنظیمات شخصی/);
  assert.match(app, /citizen-madani-home-page/);
  assert.match(app, /citizen-madani-notification-filter/);
  assert.match(app, /citizen-madani-compact/);
  assert.match(app, /setNotificationReadFilter\(defaultNotificationFilter\)/);
  assert.match(css, /\.compact-mode/);
  assert.match(css, /\.settings-switch/);
});


test('admin home dashboard derives operational metrics from loaded records and links to real admin pages', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /className="admin-dashboard"/);
  assert.match(app, /activeEmployeeCount/);
  assert.match(app, /adminPendingRequests/);
  assert.match(app, /adminPendingShiftChanges/);
  assert.match(app, /calendarMonthShifts\.length/);
  assert.match(app, /adminDepartmentStats/);
  assert.match(app, /go\('مدیریت کارکنان'\)/);
  assert.match(app, /go\('سجل فعالیت‌ها'\)/);
  assert.match(css, /\.admin-dashboard-stats/);
  assert.match(css, /\.admin-department-track/);
  assert.match(css, /@media\(max-width:520px\)\{\.admin-dashboard/);
});


test('admin dashboard displays a live shift-type breakdown for the selected month', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /const adminShiftTypeStats = useMemo/);
  assert.match(app, /shift\.shift_type === 'morning'/);
  assert.match(app, /shift\.shift_type === 'evening'/);
  assert.match(app, /shift\.shift_type === 'night'/);
  assert.match(app, /className="admin-shift-types-card"/);
  assert.match(css, /\.admin-shift-type-track i\.evening/);
  assert.match(css, /\.admin-shift-type-track i\.night/);
});


test('shift report exports filtered rows to a formatted Excel workbook', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const exportShiftCalendarExcel = \(\) =>/);
  assert.match(app, /XLSX\.utils\.json_to_sheet\(rows\)/);
  assert.match(app, /XLSX\.utils\.book_append_sheet\(workbook, worksheet, 'گزارش شیفت'\)/);
  assert.match(app, /XLSX\.writeFile\(workbook/);
  assert.match(app, /onClick=\{exportShiftCalendarExcel\}/);
  assert.match(app, /خروجی CSV/);
  assert.match(app, /خروجی Excel/);
});


test('shift report compares workload across active employees, including zero-shift staff', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const employeeWorkloadStats = useMemo/);
  assert.match(app, /person\.is_active !== false/);
  assert.match(app, /counts\.get\(person\.id\) \|\| 0/);
  assert.match(app, /توزیع بار کاری کارکنان/);
  assert.match(app, /میانگین شیفت در بازه و فیلتر فعلی/);
  assert.match(app, /نزدیک میانگین/);
});


test('admin audit log supports local search, entity filters, and filtered CSV export', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const \[auditQuery, setAuditQuery\]/);
  assert.match(app, /const \[auditActionFilter, setAuditActionFilter\]/);
  assert.match(app, /const filteredAuditEntries = useMemo/);
  assert.match(app, /filteredAuditEntries\.forEach\(entry => rows\.push/);
  assert.match(app, /citizen-madani-admin-audit\.csv/);
  assert.match(app, /جست‌وجوی سجل فعالیت‌ها/);
  assert.match(app, /خروجی CSV/);
});
