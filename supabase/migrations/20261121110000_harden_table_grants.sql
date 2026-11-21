-- Explicitly remove broad table-level mutation privileges that may be present
-- through project default grants. Re-grant only the columns used by each workflow.

revoke insert, update, delete, truncate, references, trigger
  on public.employee_profiles from anon, authenticated;
grant select on public.employee_profiles to authenticated;
grant update (display_name, department, job_title, employee_code, is_active)
  on public.employee_profiles to authenticated;

revoke update on public.exchange_requests from authenticated;
grant update (status, reviewed_at) on public.exchange_requests to authenticated;

revoke update on public.announcements from authenticated;
grant update (is_published, published_at) on public.announcements to authenticated;

revoke update on public.direct_messages from authenticated;
grant update (read_at) on public.direct_messages to authenticated;
