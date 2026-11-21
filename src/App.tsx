import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeftRight, Bell, Building2, CalendarDays, ChevronLeft, ClipboardList, Download, FileText, HeartHandshake, Home, LogIn, LogOut, Menu, Search, ShieldCheck, UserRound, Users, X, Megaphone, History } from 'lucide-react'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { supabase } from './lib/supabase'

type Page = 'خانه' | 'همکاران' | 'درخواست تبادل' | 'درخواست‌های من' | 'پروفایل' | 'مدیریت درخواست‌ها' | 'مدیریت کارکنان' | 'سجل فعالیت‌ها' | 'برنامه شیفت‌ها' | 'اطلاعیه‌ها' | 'پیام‌ها'
type Profile = { id: string; display_name: string; department: string | null; job_title: string | null; role?: string; is_active?: boolean }
type ExchangeRequest = { id: string; employee_id?: string; request_type: string; from_unit: string; to_unit: string; note: string | null; status: string; created_at: string }
type Announcement = { id: string; title: string; body: string; priority: 'normal' | 'important'; is_published: boolean; created_at: string; published_at: string | null }
type MessageAttachment = { path: string; name: string; type: string; size: number }
type DirectMessage = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null; attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null; attachments?: MessageAttachment[] | null; deleted_at?: string | null }
type AuditEntry = { id: number; actor_id: string | null; target_id: string | null; entity_type: string; action: string; details: Record<string, unknown>; created_at: string }
type WorkShift = { id: string; employee_id: string; shift_date: string; shift_type: 'morning' | 'evening' | 'night'; starts_at: string; ends_at: string; department: string; notes: string | null; created_at: string }
type ShiftChangeRequest = { id: string; requester_id: string; from_shift_id: string; to_shift_id: string; note: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string }

const units = ['اورژانس', 'داخلی', 'جراحی', 'ICU', 'آزمایشگاه', 'رادیولوژی', 'داروخانه', 'پذیرش', 'سایر']

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const nav: { label: Page; icon: typeof Home }[] = [
  { label: 'خانه', icon: Home }, { label: 'همکاران', icon: Users }, { label: 'برنامه شیفت‌ها', icon: CalendarDays },
  { label: 'درخواست تبادل', icon: ArrowLeftRight }, { label: 'درخواست‌های من', icon: ClipboardList },
  { label: 'پروفایل', icon: UserRound }, { label: 'اطلاعیه‌ها', icon: Megaphone }, { label: 'پیام‌ها', icon: Bell },
]

function App() {
  const [page, setPage] = useState<Page>('خانه')
  const [mobileNav, setMobileNav] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [colleagues, setColleagues] = useState<Profile[]>([])
  const [requests, setRequests] = useState<ExchangeRequest[]>([])
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({})
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null)
  const [employeeNameDraft, setEmployeeNameDraft] = useState('')
  const [employeeDepartmentDraft, setEmployeeDepartmentDraft] = useState('')
  const [employeeTitleDraft, setEmployeeTitleDraft] = useState('')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedContact, setSelectedContact] = useState<Profile | null>(null)
  const [threadMessages, setThreadMessages] = useState<DirectMessage[]>([])
  const [inboxMessages, setInboxMessages] = useState<DirectMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactFilter, setContactFilter] = useState<'all' | 'unread' | 'messaged' | 'new'>('all')
  const [threadQuery, setThreadQuery] = useState('')
  const threadLoadSequence = useRef(0)
  const [messageDraft, setMessageDraft] = useState('')
  const [messageAttachments, setMessageAttachments] = useState<File[]>([])
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string; kind: 'image' | 'pdf' | 'file'; mime?: string; size?: number; rows?: string[][]; sheetName?: string; truncated?: boolean; totalRows?: number; docText?: string; docTruncated?: boolean; gallery?: { url: string; name: string }[]; galleryIndex?: number } | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([])
  const [shiftChangeRequests, setShiftChangeRequests] = useState<ShiftChangeRequest[]>([])
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [reportDepartment, setReportDepartment] = useState('all')
  const [reportShiftType, setReportShiftType] = useState('all')
  const [reportEmployee, setReportEmployee] = useState('all')
  const [shiftType, setShiftType] = useState<'morning' | 'evening' | 'night'>('morning')
  const [shiftStartsAt, setShiftStartsAt] = useState('07:00')
  const [shiftEndsAt, setShiftEndsAt] = useState('15:00')
  const [shiftDepartment, setShiftDepartment] = useState(units[0])
  const [shiftEmployeeId, setShiftEmployeeId] = useState('')
  const [shiftNotes, setShiftNotes] = useState('')
  const [swapFromId, setSwapFromId] = useState('')
  const [swapToId, setSwapToId] = useState('')
  const [swapNote, setSwapNote] = useState('')
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [announcementPriority, setAnnouncementPriority] = useState<'normal' | 'important'>('normal')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('تبادل بخش')
  const [from, setFrom] = useState(units[0])
  const [to, setTo] = useState(units[1])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const configured = Boolean(supabase)
  const isAdmin = profile?.role === 'admin'
  const myRequests = requests.filter(r => r.employee_id === profile?.id)
  const filtered = useMemo(() => colleagues.filter(c =>
    [c.display_name, c.job_title, c.department].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())
  ), [colleagues, query])
  const filteredEmployees = useMemo(() => colleagues.filter(employee => {
    const matchesQuery = [employee.display_name, employee.job_title, employee.department].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(employeeQuery.trim().toLocaleLowerCase('fa'))
    const matchesStatus = employeeStatusFilter === 'all' || (employeeStatusFilter === 'active' ? employee.is_active !== false : employee.is_active === false)
    return matchesQuery && matchesStatus
  }).sort((a, b) => (a.is_active === false ? 1 : 0) - (b.is_active === false ? 1 : 0) || a.display_name.localeCompare(b.display_name, 'fa')), [colleagues, employeeQuery, employeeStatusFilter])
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth()
    const offset = (new Date(year, month, 1).getDay() + 1) % 7
    const days = new Date(year, month + 1, 0).getDate()
    const count = Math.ceil((offset + days) / 7) * 7
    return Array.from({ length: count }, (_, index) => {
      const day = index - offset + 1
      if (day < 1 || day > days) return null
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { key, date: new Date(year, month, day, 12), shifts: workShifts.filter(shift => shift.shift_date === key) }
    })
  }, [calendarMonth, workShifts])
  const calendarMonthShifts = useMemo(() => workShifts.filter(shift => {
    const [year, month] = shift.shift_date.split('-').map(Number)
    return year === calendarMonth.getFullYear() && month === calendarMonth.getMonth() + 1
  }), [calendarMonth, workShifts])
  const reportDepartments = useMemo(() => [...new Set(calendarMonthShifts.map(shift => shift.department))].sort((a, b) => a.localeCompare(b, 'fa')), [calendarMonthShifts])
  const reportEmployees = useMemo(() => [...new Set(calendarMonthShifts.map(shift => shift.employee_id))]
    .map(id => colleagues.find(person => person.id === id)).filter((person): person is Profile => Boolean(person))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fa')), [calendarMonthShifts, colleagues])
  const filteredReportShifts = useMemo(() => calendarMonthShifts.filter(shift =>
    (reportDepartment === 'all' || shift.department === reportDepartment) &&
    (reportShiftType === 'all' || shift.shift_type === reportShiftType) &&
    (reportEmployee === 'all' || shift.employee_id === reportEmployee)
  ), [calendarMonthShifts, reportDepartment, reportShiftType, reportEmployee])
  const monthlyShiftStats = useMemo(() => ({
    total: filteredReportShifts.length,
    morning: filteredReportShifts.filter(shift => shift.shift_type === 'morning').length,
    evening: filteredReportShifts.filter(shift => shift.shift_type === 'evening').length,
    night: filteredReportShifts.filter(shift => shift.shift_type === 'night').length,
    employees: new Set(filteredReportShifts.map(shift => shift.employee_id)).size,
    departments: Array.from(filteredReportShifts.reduce((map, shift) => map.set(shift.department, (map.get(shift.department) || 0) + 1), new Map<string, number>()).entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa')),
  }), [filteredReportShifts])
  const dailyShiftStats = useMemo(() => {
    const counts = new Map<string, number>()
    filteredReportShifts.forEach(shift => counts.set(shift.shift_date, (counts.get(shift.shift_date) || 0) + 1))
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredReportShifts])
  const employeeShiftStats = useMemo(() => {
    const counts = new Map<string, number>()
    filteredReportShifts.forEach(shift => counts.set(shift.employee_id, (counts.get(shift.employee_id) || 0) + 1))
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count, name: colleagues.find(person => person.id === id)?.display_name || 'کارمند' }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'))
      .slice(0, 6)
  }, [filteredReportShifts, colleagues])
  const resetShiftReportFilters = () => { setReportDepartment('all'); setReportShiftType('all'); setReportEmployee('all') }
  const exportShiftCalendar = () => {
    const rows = [['تاریخ', 'نام کارمند', 'بخش', 'نوع شیفت', 'ساعت شروع', 'ساعت پایان', 'توضیحات']]
    filteredReportShifts.forEach(shift => rows.push([
      shift.shift_date, colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند',
      shift.department, shiftTypeLabel(shift.shift_type), shift.starts_at.slice(0, 5), shift.ends_at.slice(0, 5), shift.notes || ''
    ]))
    const csv = '\uFEFF' + rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `shift-report-${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}.csv`
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }

  const pendingMyRequests = myRequests.filter(request => request.status === 'pending').length
  const approvedMyRequests = myRequests.filter(request => request.status === 'approved').length
  const publishedAnnouncementCount = announcements.filter(item => item.is_published).length
  const todayKey = dateKey(new Date())
  const myUpcomingShifts = useMemo(() => workShifts
    .filter(shift => shift.employee_id === profile?.id && shift.shift_date >= todayKey)
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3), [workShifts, profile?.id, todayKey])
  const adminPendingRequests = requests.filter(request => request.status === 'pending').length
  const adminPendingShiftChanges = shiftChangeRequests.filter(request => request.status === 'pending').length
  const activeEmployeeCount = colleagues.filter(employee => employee.is_active !== false).length
  const inactiveEmployeeCount = colleagues.length - activeEmployeeCount
  const inboxByContact = useMemo(() => {
    const summary = new Map<string, { latest: DirectMessage; unread: number }>()
    inboxMessages.forEach(item => {
      const contactId = item.sender_id === profile?.id ? item.recipient_id : item.sender_id
      const current = summary.get(contactId)
      if (!current || item.created_at > current.latest.created_at) summary.set(contactId, { latest: item, unread: current?.unread ?? 0 })
      if (item.recipient_id === profile?.id && !item.read_at && !item.deleted_at) {
        const entry = summary.get(contactId)
        if (entry) entry.unread += 1
        else summary.set(contactId, { latest: item, unread: 1 })
      }
    })
    return summary
  }, [inboxMessages, profile?.id])
  const filteredThreadMessages = useMemo(() => {
    const query = threadQuery.trim().toLocaleLowerCase('fa')
    if (!query) return threadMessages
    return threadMessages.filter(item => [
      item.deleted_at ? 'پیام حذف شده است' : item.body,
      item.attachment_name,
      item.attachment_type,
      ...(item.attachments ?? []).map(file => file.name),
      ...(item.attachments ?? []).map(file => file.type),
    ].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(query))
  }, [threadMessages, threadQuery])

  const contactFilterCounts = useMemo(() => {
    const contacts = colleagues.filter(person => person.id !== profile?.id)
    return {
      all: contacts.length,
      unread: contacts.filter(person => (inboxByContact.get(person.id)?.unread ?? 0) > 0).length,
      messaged: contacts.filter(person => Boolean(inboxByContact.get(person.id)?.latest)).length,
      new: contacts.filter(person => !inboxByContact.get(person.id)?.latest).length,
    }
  }, [colleagues, profile?.id, inboxByContact])

  const sortedContacts = useMemo(() => colleagues
    .filter(person => person.id !== profile?.id)
    .filter(person => {
      const summary = inboxByContact.get(person.id)
      const latest = summary?.latest
      const matchesFilter = contactFilter === 'all' ||
        (contactFilter === 'unread' && (summary?.unread ?? 0) > 0) ||
        (contactFilter === 'messaged' && Boolean(latest)) ||
        (contactFilter === 'new' && !latest)
      const matchesQuery = [person.display_name, person.job_title, person.department, latest?.deleted_at ? 'پیام حذف شده است' : latest?.body]
        .filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(contactQuery.trim().toLocaleLowerCase('fa'))
      return matchesFilter && matchesQuery
    })
    .sort((left, right) => {
      const leftDate = inboxByContact.get(left.id)?.latest.created_at || ''
      const rightDate = inboxByContact.get(right.id)?.latest.created_at || ''
      return rightDate.localeCompare(leftDate) || left.display_name.localeCompare(right.display_name, 'fa')
    }), [colleagues, profile?.id, inboxByContact, contactQuery, contactFilter])

  const groupedContacts = useMemo(() => sortedContacts.reduce((groups, person) => {
    const department = person.department?.trim() || 'بدون واحد سازمانی'
    if (!groups[department]) groups[department] = []
    groups[department].push(person)
    return groups
  }, {} as Record<string, Profile[]>), [sortedContacts])


  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      setUserEmail(data.session?.user.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      if (!session) { setProfile(null); setRequests([]); setSelectedContact(null); setThreadMessages([]); setInboxMessages([]); setMessageDraft(''); setUnreadCount(0); threadLoadSequence.current += 1; setThreadLoading(false) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !userEmail) return
    const client = supabase
    let active = true
    const load = async () => {
      const { data: userData } = await client.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const [profileResult, peopleResult, requestResult] = await Promise.all([
        client.from('employee_profiles').select('id,display_name,department,job_title,role,is_active').eq('id', userId).maybeSingle(),
        client.from('employee_profiles').select('id,display_name,department,job_title,is_active').order('display_name'),
        client.from('exchange_requests').select('id,employee_id,request_type,from_unit,to_unit,note,status,created_at').order('created_at', { ascending: false }),
      ])
      if (!active) return
      if (profileResult.error) setError(profileResult.error.message)
      else setProfile(profileResult.data)
      if (peopleResult.error) setError(peopleResult.error.message)
      else setColleagues(peopleResult.data ?? [])
      if (requestResult.error) setError(requestResult.error.message)
      else setRequests(requestResult.data ?? [])
      const { data: announcementData, error: announcementError } = await client.from('announcements').select('id,title,body,priority,is_published,created_at,published_at').order('created_at', { ascending: false })
      if (active && announcementError) setError(announcementError.message)
      if (active && announcementData) setAnnouncements(announcementData)
      const [shiftResult, shiftRequestResult] = await Promise.all([
        client.from('work_shifts').select('id,employee_id,shift_date,shift_type,starts_at,ends_at,department,notes,created_at').gte('shift_date', dateKey(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1))).lte('shift_date', dateKey(new Date(new Date().getFullYear() + 1, new Date().getMonth() + 1, 0))).order('shift_date').order('starts_at').limit(1500),
        client.from('shift_change_requests').select('id,requester_id,from_shift_id,to_shift_id,note,status,reviewed_by,reviewed_at,created_at').order('created_at', { ascending: false }).limit(200),
      ])
      if (active && shiftResult.error) setError('بارگذاری برنامه شیفت‌ها انجام نشد؛ Migration مدیریت شیفت را اجرا کنید.')
      if (active && shiftResult.data) setWorkShifts(shiftResult.data as WorkShift[])
      if (active && shiftRequestResult.error) setError('بارگذاری درخواست‌های جابه‌جایی شیفت انجام نشد؛ Migration مدیریت شیفت را بررسی کنید.')
      if (active && shiftRequestResult.data) setShiftChangeRequests(shiftRequestResult.data as ShiftChangeRequest[])
      if (profileResult.data?.role === 'admin') {
        const { data: auditData, error: auditError } = await client.from('admin_audit_log').select('id,actor_id,target_id,entity_type,action,details,created_at').order('created_at', { ascending: false }).limit(100)
        if (active && auditError) setError('بارگذاری گزارش فعالیت مدیران انجام نشد؛ Migration ثبت رویدادها را بررسی کنید.')
        if (active && auditData) setAuditEntries(auditData as AuditEntry[])
      } else if (active) setAuditEntries([])
      const [{ count }, inboxResult] = await Promise.all([
        client.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null).is('deleted_at', null),
        client.from('direct_messages').select('id,sender_id,recipient_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size,attachments,deleted_at').or(`sender_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false }).limit(300),
      ])
      if (active) { setUnreadCount(count ?? 0); if (inboxResult.data) setInboxMessages(inboxResult.data as DirectMessage[]) }
      const ids = [...new Set((requestResult.data ?? []).map((r: any) => r.employee_id))]
      if (ids.length) {
        const { data: names } = await client.from('employee_profiles').select('id,display_name').in('id', ids)
        if (active && names) setEmployeeNames(Object.fromEntries(names.map((p: any) => [p.id, p.display_name])))
      }
    }
    load()
    return () => { active = false }
  }, [userEmail, profile?.role])

  useEffect(() => {
    if (!supabase || !profile?.id) return
    const client = supabase
    const channel = client.channel(`employee-inbox-${profile.id}-${selectedContact?.id ?? 'none'}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `recipient_id=eq.${profile.id}`,
      }, payload => {
        const incoming = payload.new as DirectMessage
        if (selectedContact?.id === incoming.sender_id) {
          setThreadMessages(current => current.some(m => m.id === incoming.id) ? current : [...current, incoming])
          setInboxMessages(current => [incoming, ...current.filter(m => m.id !== incoming.id)])
          const readAt = new Date().toISOString()
          void client.from('direct_messages').update({ read_at: readAt })
            .eq('id', incoming.id).eq('recipient_id', profile.id)
          setThreadMessages(current => current.map(m => m.id === incoming.id ? { ...m, read_at: readAt } : m))
          setInboxMessages(current => current.map(m => m.id === incoming.id ? { ...m, read_at: readAt } : m))
        } else {
          setUnreadCount(current => current + 1)
          setInboxMessages(current => [incoming, ...current.filter(m => m.id !== incoming.id)])
          setMessage('یک پیام جدید دریافت کردید.')
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'direct_messages',
        filter: `sender_id=eq.${profile.id}`,
      }, payload => {
        const updated = payload.new as DirectMessage
        setThreadMessages(current => current.map(item => item.id === updated.id ? { ...item, read_at: updated.read_at, deleted_at: updated.deleted_at ?? item.deleted_at } : item))
        setInboxMessages(current => current.map(item => item.id === updated.id ? { ...item, read_at: updated.read_at, deleted_at: updated.deleted_at ?? item.deleted_at } : item))
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [profile?.id, selectedContact?.id])

  const login = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (loginError) setError('ورود انجام نشد. ایمیل و رمز عبور را بررسی کنید.')
    else { setShowLogin(false); setPassword(''); setMessage('با موفقیت وارد سامانه شدید.') }
    setBusy(false)
  }

  const logout = async () => {
    if (!supabase) return
    const { error: logoutError } = await supabase.auth.signOut()
    if (logoutError) setError(logoutError.message)
    else { setPage('خانه'); setSelectedContact(null); setThreadMessages([]); setInboxMessages([]); setMessageDraft(''); setContactQuery(''); setUnreadCount(0); setMessage('از حساب کاربری خارج شدید.') }
  }

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !userEmail) { setError('برای ثبت درخواست ابتدا وارد سامانه شوید.'); return }
    if (from === to) { setError('بخش مبدأ و مقصد نمی‌توانند یکسان باشند.'); return }
    setBusy(true); setError(''); setMessage('')
    const { data: userData } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('exchange_requests').insert({
      employee_id: userData.user?.id, request_type: kind, from_unit: from, to_unit: to, note: note.trim() || null,
    })
    if (insertError) setError('ثبت درخواست ناموفق بود. لطفاً دوباره تلاش کنید.')
    else {
      setMessage('درخواست شما با موفقیت ثبت شد.')
      setNote('')
      const { data } = await supabase.from('exchange_requests').select('id,employee_id,request_type,from_unit,to_unit,note,status,created_at').order('created_at', { ascending: false })
      setRequests(data ?? [])
      setPage('درخواست‌های من')
    }
    setBusy(false)
  }

  const reviewRequest = async (id: string, status: 'approved' | 'rejected') => {
    if (!supabase || !isAdmin) return
    setBusy(true); setError(''); setMessage('')
    const { error: updateError } = await supabase.from('exchange_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id)
    if (updateError) setError('تغییر وضعیت انجام نشد؛ دسترسی مدیر را بررسی کنید.')
    else { setRequests(current => current.map(r => r.id === id ? { ...r, status } : r)); setMessage('وضعیت درخواست به‌روزرسانی شد.') }
    setBusy(false)
  }

  const createWorkShift = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !isAdmin || !profile) return
    if (!shiftEmployeeId) { setError('ابتدا کارمند دریافت‌کننده شیفت را انتخاب کنید.'); return }
    if (shiftDate < new Date().toISOString().slice(0, 10)) { setError('تاریخ شیفت نمی‌تواند در گذشته باشد.'); return }
    if (shiftStartsAt === shiftEndsAt) { setError('ساعت شروع و پایان شیفت نباید یکسان باشد.'); return }
    setBusy(true); setError(''); setMessage('')
    const { data, error: insertError } = await supabase.from('work_shifts').insert({
      employee_id: shiftEmployeeId, shift_date: shiftDate, shift_type: shiftType,
      starts_at: shiftStartsAt, ends_at: shiftEndsAt, department: shiftDepartment,
      notes: shiftNotes.trim() || null, created_by: profile.id,
    }).select('id,employee_id,shift_date,shift_type,starts_at,ends_at,department,notes,created_at').single()
    if (insertError) setError(insertError.code === '23505' ? 'برای این کارمند در این تاریخ و نوع شیفت، برنامه‌ای از قبل ثبت شده است.' : 'ثبت شیفت انجام نشد؛ مجوز مدیر و Migration را بررسی کنید.')
    else { setWorkShifts(current => [...current, data as WorkShift].sort((a,b) => a.shift_date.localeCompare(b.shift_date) || a.starts_at.localeCompare(b.starts_at))); setShiftNotes(''); setMessage('شیفت با موفقیت در برنامه کاری ثبت شد.') }
    setBusy(false)
  }

  const requestShiftSwap = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !profile) return
    if (!swapFromId || !swapToId || swapFromId === swapToId) { setError('دو شیفت متفاوت را برای جابه‌جایی انتخاب کنید.'); return }
    setBusy(true); setError(''); setMessage('')
    const { data, error: insertError } = await supabase.from('shift_change_requests').insert({
      requester_id: profile.id, from_shift_id: swapFromId, to_shift_id: swapToId, note: swapNote.trim() || null,
    }).select('id,requester_id,from_shift_id,to_shift_id,note,status,reviewed_by,reviewed_at,created_at').single()
    if (insertError) setError('ثبت درخواست جابه‌جایی انجام نشد؛ ممکن است شیفت تغییر کرده یا درخواست بازی داشته باشید.')
    else { setShiftChangeRequests(current => [data as ShiftChangeRequest, ...current]); setSwapNote(''); setMessage('درخواست جابه‌جایی برای تأیید مدیر ارسال شد.') }
    setBusy(false)
  }

  const reviewShiftSwap = async (id: string, status: 'approved' | 'rejected') => {
    if (!supabase || !isAdmin) return
    setBusy(true); setError(''); setMessage('')
    const { error: updateError } = await supabase.from('shift_change_requests').update({ status }).eq('id', id)
    if (updateError) setError('بررسی درخواست انجام نشد؛ ممکن است تخصیص شیفت تغییر کرده باشد.')
    else {
      setShiftChangeRequests(current => current.map(item => item.id === id ? { ...item, status, reviewed_at: new Date().toISOString() } : item))
      const { data } = await supabase.from('work_shifts').select('id,employee_id,shift_date,shift_type,starts_at,ends_at,department,notes,created_at').gte('shift_date', new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).toISOString().slice(0, 10)).lte('shift_date', new Date(new Date().getFullYear() + 1, new Date().getMonth() + 1, 0).toISOString().slice(0, 10)).order('shift_date').order('starts_at').limit(1500)
      if (data) setWorkShifts(data as WorkShift[])
      setMessage(status === 'approved' ? 'جابه‌جایی تأیید و تخصیص دو شیفت به‌صورت خودکار عوض شد.' : 'درخواست جابه‌جایی رد شد.')
    }
    setBusy(false)
  }

  const createAnnouncement = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !isAdmin || !profile) return
    if (!announcementTitle.trim() || !announcementBody.trim()) { setError('عنوان و متن اطلاعیه را وارد کنید.'); return }
    setBusy(true); setError(''); setMessage('')
    const { data, error: insertError } = await supabase.from('announcements').insert({
      title: announcementTitle.trim(), body: announcementBody.trim(), priority: announcementPriority,
      created_by: profile.id, is_published: false,
    }).select('id,title,body,priority,is_published,created_at,published_at').single()
    if (insertError) setError('ثبت اطلاعیه انجام نشد. دسترسی مدیر و تنظیم پایگاه داده را بررسی کنید.')
    else {
      setAnnouncements(current => [data, ...current])
      setAnnouncementTitle(''); setAnnouncementBody(''); setAnnouncementPriority('normal')
      setMessage('اطلاعیه به‌صورت پیش‌نویس ذخیره شد.')
    }
    setBusy(false)
  }

  const toggleAnnouncement = async (item: Announcement) => {
    if (!supabase || !isAdmin) return
    setBusy(true); setError(''); setMessage('')
    const publish = !item.is_published
    const publishedAt = publish ? new Date().toISOString() : null
    const { error: updateError } = await supabase.from('announcements').update({
      is_published: publish, published_at: publishedAt,
    }).eq('id', item.id)
    if (updateError) setError('تغییر وضعیت انتشار انجام نشد.')
    else {
      setAnnouncements(current => current.map(a => a.id === item.id ? { ...a, is_published: publish, published_at: publishedAt } : a))
      setMessage(publish ? 'اطلاعیه منتشر شد.' : 'اطلاعیه از حالت انتشار خارج شد.')
    }
    setBusy(false)
  }

  const beginEmployeeEdit = (employee: Profile) => {
    setEditingEmployee(employee)
    setEmployeeNameDraft(employee.display_name || '')
    setEmployeeDepartmentDraft(employee.department || '')
    setEmployeeTitleDraft(employee.job_title || '')
    setError('')
  }

  const saveEmployee = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !isAdmin || !editingEmployee) return
    if (!employeeNameDraft.trim()) { setError('نام نمایشی کارمند الزامی است.'); return }
    setBusy(true); setError(''); setMessage('')
    const changes = {
      display_name: employeeNameDraft.trim(),
      department: employeeDepartmentDraft.trim() || null,
      job_title: employeeTitleDraft.trim() || null,
    }
    const { error: saveError } = await supabase.from('employee_profiles').update(changes).eq('id', editingEmployee.id)
    if (saveError) setError('ذخیره مشخصات انجام نشد؛ مجوز مدیر و Migration مدیریت کارکنان را بررسی کنید.')
    else {
      setColleagues(current => current.map(person => person.id === editingEmployee.id ? { ...person, ...changes } : person))
      if (profile?.id === editingEmployee.id) setProfile(current => current ? { ...current, ...changes } : current)
      setEditingEmployee(null)
      setMessage('مشخصات پرسنلی با موفقیت به‌روزرسانی شد.')
    }
    setBusy(false)
  }

  const toggleEmployeeActive = async (employee: Profile) => {
    if (!supabase || !isAdmin || employee.id === profile?.id) return
    const nextActive = employee.is_active === false
    setBusy(true); setError(''); setMessage('')
    const { error: statusError } = await supabase.from('employee_profiles').update({ is_active: nextActive }).eq('id', employee.id)
    if (statusError) setError('تغییر وضعیت حساب انجام نشد؛ دسترسی مدیر را بررسی کنید.')
    else {
      setColleagues(current => current.map(person => person.id === employee.id ? { ...person, is_active: nextActive } : person))
      setMessage(nextActive ? 'حساب کارمند فعال شد.' : 'حساب کارمند غیرفعال شد.')
    }
    setBusy(false)
  }

  const loadThread = async (contact: Profile) => {
    if (!supabase || !profile) return
    const sequence = ++threadLoadSequence.current
    setSelectedContact(contact); setThreadMessages([]); setThreadQuery(''); setThreadLoading(true); setError('')
    const { data, error: loadError } = await supabase.from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size,deleted_at')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${contact.id}),and(sender_id.eq.${contact.id},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true })
    if (sequence !== threadLoadSequence.current) return
    if (loadError) { setError('بارگذاری گفت‌وگو انجام نشد.'); setThreadLoading(false); return }
    const loadedMessages = data ?? []
    setThreadMessages(loadedMessages)
    const unreadIds = loadedMessages.filter(m => m.recipient_id === profile.id && !m.read_at).map(m => m.id)
    if (unreadIds.length) {
      const readAt = new Date().toISOString()
      const { error: readError } = await supabase.from('direct_messages').update({ read_at: readAt }).in('id', unreadIds)
      if (sequence !== threadLoadSequence.current) return
      if (readError) setError('پیام‌ها نمایش داده شدند اما وضعیت خوانده‌شدن ثبت نشد.')
      else {
        setThreadMessages(current => current.map(m => unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m))
        setInboxMessages(current => current.map(m => unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m))
        setUnreadCount(current => Math.max(0, current - unreadIds.length))
      }
    }
    if (sequence === threadLoadSequence.current) setThreadLoading(false)
  }

  const sendDirectMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !profile || !selectedContact || (!messageDraft.trim() && !messageAttachments.length)) return
    const allowedTypes = ['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    const totalSize = messageAttachments.reduce((sum, file) => sum + file.size, 0)
    if (messageAttachments.length > 5 || totalSize > 10 * 1024 * 1024 || messageAttachments.some(file => file.size === 0 || !allowedTypes.includes(file.type))) {
      setError('حداکثر ۵ فایل با مجموع حجم ۱۰ مگابایت مجاز است؛ نوع فایل‌ها را نیز بررسی کنید.'); return
    }
    setBusy(true); setError(''); setMessage('در حال بارگذاری پیوست‌ها...')
    const uploaded: MessageAttachment[] = []
    try {
      for (const file of messageAttachments) {
        const safeName = file.name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-100) || 'attachment'
        const path = profile.id + '/' + selectedContact.id + '/' + crypto.randomUUID() + '-' + safeName
        const { error: uploadError } = await supabase.storage.from('employee-message-attachments').upload(path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw new Error('upload')
        uploaded.push({ path, name: file.name, type: file.type, size: file.size })
      }
      const first = uploaded[0]
      const { data, error: sendError } = await supabase.from('direct_messages').insert({
        sender_id: profile.id, recipient_id: selectedContact.id, body: messageDraft.trim(), attachments: uploaded,
        attachment_path: first?.path ?? null, attachment_name: first?.name ?? null,
        attachment_type: first?.type ?? null, attachment_size: first?.size ?? null,
      }).select('id,sender_id,recipient_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size,attachments,deleted_at').single()
      if (sendError) throw new Error('send')
      setThreadMessages(current => [...current, data as DirectMessage])
      setInboxMessages(current => [data as DirectMessage, ...current.filter(m => m.id !== data.id)])
      setMessageDraft(''); setMessageAttachments([]); setMessage('پیام و پیوست‌ها با موفقیت ارسال شدند.')
    } catch {
      if (uploaded.length) await supabase.storage.from('employee-message-attachments').remove(uploaded.map(file => file.path))
      setError('ارسال پیام کامل نشد؛ فایل‌های موقت پاک‌سازی شدند. اتصال و دسترسی ذخیره‌سازی را بررسی کنید.')
      setMessage('')
    } finally { setBusy(false) }
  }

  const deleteOwnMessage = async (item: DirectMessage) => {
    if (!supabase || !profile || item.sender_id !== profile.id || item.deleted_at || busy) return
    if (!window.confirm('این پیام برای هر دو طرف حذف شود؟')) return
    setBusy(true); setError(''); setMessage('')
    const { data: attachmentPaths, error: deleteError } = await supabase.rpc('delete_own_direct_message', { message_id: item.id })
    if (deleteError) {
      setError('حذف پیام انجام نشد. Migration حذف امن پیام را در Supabase اجرا کنید.')
      setBusy(false)
      return
    }
    const deletedAt = new Date().toISOString()
    const markDeleted = (message: DirectMessage): DirectMessage => message.id === item.id
      ? { ...message, body: 'این پیام حذف شده است.', attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null, attachments: [], deleted_at: deletedAt }
      : message
    setThreadMessages(current => current.map(markDeleted))
    setInboxMessages(current => current.map(markDeleted))
    const pathsToRemove = Array.isArray(attachmentPaths) ? attachmentPaths.filter((path): path is string => typeof path === 'string') : typeof attachmentPaths === 'string' && attachmentPaths ? [attachmentPaths] : []
    if (pathsToRemove.length) {
      const { error: storageError } = await supabase.storage.from('employee-message-attachments').remove(pathsToRemove)
      if (storageError) setError('پیام حذف شد؛ پاک‌سازی فایل پیوست به‌دلیل خطای ذخیره‌سازی کامل نشد.')
      else setMessage('پیام و پیوست آن حذف شدند.')
    } else setMessage('پیام حذف شد.')
    setBusy(false)
  }

  const openMessageAttachment = async (item: DirectMessage, selectedFile?: MessageAttachment) => {
    if (!supabase) return
    const file = selectedFile ?? (item.attachment_path ? { path: item.attachment_path, name: item.attachment_name || 'فایل پیوست', type: item.attachment_type || 'application/octet-stream', size: item.attachment_size ?? 0 } : null)
    if (!file?.path) return
    const { data, error: linkError } = await supabase.storage.from('employee-message-attachments').createSignedUrl(file.path, 300)
    if (linkError || !data?.signedUrl) { setError('دریافت پیوست ممکن نیست؛ دسترسی گفت‌وگو را بررسی کنید.'); return }
    if (file.type?.startsWith('image/')) {
      const allFiles = item.attachments?.length ? item.attachments : [file]
      const images = allFiles.filter(candidate => candidate.type.startsWith('image/'))
      const gallery = await Promise.all(images.map(async candidate => {
        const { data: imageLink } = await supabase!.storage.from('employee-message-attachments').createSignedUrl(candidate.path, 300)
        return imageLink?.signedUrl ? { url: imageLink.signedUrl, name: candidate.name } : null
      }))
      const availableGallery = gallery.filter((entry): entry is { url: string; name: string } => Boolean(entry))
      const galleryIndex = Math.max(0, availableGallery.findIndex(entry => entry.name === file.name))
      setAttachmentPreview({ url: data.signedUrl, name: file.name || 'پیش‌نمایش تصویر', kind: 'image', gallery: availableGallery, galleryIndex })
    } else if (file.type === 'application/pdf') {
      setAttachmentPreview({ url: data.signedUrl, name: file.name || 'پیش‌نمایش PDF', kind: 'pdf' })
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const preview = { url: data.signedUrl, name: file.name || 'سند Word', kind: 'file' as const, mime: file.type, size: file.size ?? undefined }
      setAttachmentPreview(preview)
      try {
        const response = await fetch(data.signedUrl)
        if (!response.ok) throw new Error('download failed')
        const result = await mammoth.extractRawText({ arrayBuffer: await response.arrayBuffer() })
        const text = result.value || 'متنی برای نمایش در این سند پیدا نشد.'
        setAttachmentPreview({ ...preview, docText: text.slice(0, 15000), docTruncated: text.length > 15000 })
      } catch {
        setError('خواندن پیش‌نمایش Word ممکن نشد؛ فایل همچنان از مسیر خصوصی قابل دریافت است.')
      }
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const preview = { url: data.signedUrl, name: file.name || 'فایل Excel', kind: 'file' as const, mime: file.type, size: file.size ?? undefined }
      setAttachmentPreview(preview)
      try {
        const response = await fetch(data.signedUrl)
        if (!response.ok) throw new Error('download failed')
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: true, bookVBA: false })
        const sheetName = workbook.SheetNames[0]
        const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
        if (!sheet) throw new Error('empty workbook')
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
        const rows = rawRows.slice(0, 100).map(row => row.slice(0, 20).map(value => value instanceof Date ? value.toLocaleString('fa-IR') : String(value ?? '')))
        setAttachmentPreview({ ...preview, rows, sheetName, totalRows: rawRows.length, truncated: rawRows.length > 100 || rawRows.some(row => row.length > 20) })
      } catch {
        setError('خواندن پیش‌نمایش Excel ممکن نشد؛ فایل همچنان از مسیر خصوصی قابل دریافت است.')
      }
    } else {
      setAttachmentPreview({ url: data.signedUrl, name: file.name || 'فایل پیوست', kind: 'file', mime: file.type || undefined, size: file.size ?? undefined })
    }
  }

  const go = (next: Page) => { setPage(next); setMobileNav(false); setError('') }

  return <div className="app-shell">
    <header className="topbar">
      <button className="mobile-menu icon-btn" onClick={() => setMobileNav(!mobileNav)} aria-label="منو"><Menu /></button>
      <div className="brand-mark"><Building2 size={23} /></div>
      <div className="brand"><strong>شهروند مدنی</strong><span>جامعه دیجیتال کارکنان بیمارستان مدنی</span></div>
      <div className="top-actions">
        {userEmail && <button className="icon-btn" onClick={logout} aria-label="خروج"><LogOut size={18} /></button>}
        <button className="login-btn" onClick={() => userEmail ? go('پروفایل') : setShowLogin(true)}>
          {userEmail ? <UserRound size={17} /> : <LogIn size={17} />}{userEmail ? (profile?.display_name || 'حساب کاربری') : 'ورود کارکنان'}
        </button>
      </div>
    </header>
    <div className="layout">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="side-caption">فضای کاری</div>
        {[...nav, ...(isAdmin ? [{ label: 'مدیریت درخواست‌ها' as Page, icon: ShieldCheck }, { label: 'مدیریت کارکنان' as Page, icon: Users }, { label: 'سجل فعالیت‌ها' as Page, icon: History }] : [])].map(({ label, icon: Icon }) => <button key={label} className={page === label ? 'nav-item active' : 'nav-item'} onClick={() => go(label)}><Icon size={18} /><span>{label}</span>{label === 'پیام‌ها' && unreadCount > 0 && <span className="nav-unread">{unreadCount > 99 ? '99+' : unreadCount}</span>}{page === label && <ChevronLeft size={16} className="nav-arrow" />}</button>)}
        <div className="side-card"><div className="side-card-icon"><HeartHandshake size={20} /></div><strong>همراه یکدیگر</strong><p>برای ساخت محیط کاری بهتر، ارتباط و همکاری را آسان‌تر کنیم.</p></div>
        <div className="side-footer"><ShieldCheck size={15} /> فضای اختصاصی کارکنان</div>
      </aside>
      <main className="main-content">
        <div className="welcome-row"><div><div className="eyebrow">بیمارستان مدنی · سامانه کارکنان</div><h1>{page === 'خانه' ? 'به شهروند مدنی خوش آمدید' : page}</h1><p>{page === 'خانه' ? 'ارتباط، همکاری و همراهی همکاران در یک فضای مشترک.' : 'ابزارهای ارتباط و همکاری کارکنان بیمارستان مدنی.'}</p></div><div className="date-chip"><CalendarDays size={17} /> فضای همکاری کارکنان</div></div>
        {profile?.is_active === false && <div className="notice account-disabled-notice" role="alert"><div className="notice-icon"><ShieldCheck size={20} /></div><div><strong>حساب کاربری غیرفعال است</strong><p>دسترسی شما به اطلاعات و امکانات عملیاتی سامانه محدود شده است. برای پیگیری، با مدیر سامانه یا واحد فناوری اطلاعات بیمارستان تماس بگیرید.</p></div><button className="small-outline" onClick={logout}>خروج</button></div>}
        {message && <div className="notice"><div className="notice-icon"><ShieldCheck size={20} /></div><div><strong>پیام سامانه</strong><p>{message}</p></div><button className="small-outline" onClick={() => setMessage('')}>بستن</button></div>}
        {error && <div className="notice" role="alert"><div className="notice-icon"><Bell size={20} /></div><div><strong>توجه</strong><p>{error}</p></div><button className="small-outline" onClick={() => setError('')}>بستن</button></div>}
        {!configured && <div className="notice"><div className="notice-icon"><Activity size={20} /></div><div><strong>اتصال پایگاه داده تنظیم نشده است</strong><p>برای فعال‌سازی ورود و ذخیره اطلاعات، متغیرهای Supabase را در تنظیمات محیط اجرا وارد کنید.</p></div></div>}
        {page === 'خانه' && <>
          <section className="hero-card"><div className="hero-content"><span className="hero-tag">کنار هم، قوی‌تر</span><h2>یک جامعه؛ هزاران فرصت همکاری</h2><p>با همکاران خود ارتباط بگیرید، درخواست‌های همکاری ثبت کنید و از تازه‌ترین اطلاعیه‌ها باخبر شوید.</p><button onClick={() => go('همکاران')} className="hero-btn">مشاهده همکاران <ChevronLeft size={17} /></button></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-building"><Building2 size={74} /><span>مدنی</span></div><div className="float-bubble bubble-a"><Users size={21} /></div><div className="float-bubble bubble-b"><HeartHandshake size={21} /></div></div></section>
          <section className="stats-grid"><Stat icon={Users} value={userEmail ? String(activeEmployeeCount) : '—'} label="کارکنان فعال" hint="اعضای فعال جامعه مدنی" /><Stat icon={ArrowLeftRight} value={userEmail ? String(myRequests.length) : '—'} label="درخواست‌های من" hint={userEmail ? pendingMyRequests + ' در انتظار · ' + approvedMyRequests + ' تأییدشده' : 'پس از ورود قابل مشاهده است'} /><Stat icon={Megaphone} value={userEmail ? String(publishedAnnouncementCount) : '—'} label="اطلاعیه‌های منتشرشده" hint="خبرهای قابل مشاهده کارکنان" /><Stat icon={Activity} value={configured ? 'متصل' : 'نیازمند تنظیم'} label="وضعیت سامانه" hint="وضعیت اتصال پایگاه داده" /></section>
          {userEmail && <section className="home-overview-grid">
            <article className="home-overview-card">
              <div className="home-overview-heading"><div><span className="home-overview-icon"><CalendarDays size={17}/></span><div><strong>شیفت‌های پیش‌روی من</strong><small>برنامه ثبت‌شده از امروز به بعد</small></div></div><button className="text-link" onClick={() => go('برنامه شیفت‌ها')}>مشاهده تقویم</button></div>
              {myUpcomingShifts.length ? <div className="home-upcoming-list">{myUpcomingShifts.map(shift => <div className="home-upcoming-item" key={shift.id}><div><strong>{new Date(shift.shift_date+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',day:'numeric',month:'long'})}</strong><small>{shift.department} · {shift.starts_at.slice(0,5)} تا {shift.ends_at.slice(0,5)}</small></div><span className={'shift-type-pill '+shift.shift_type}>{shiftTypeLabel(shift.shift_type)}</span></div>)}</div> : <p className="home-overview-empty">در حال حاضر شیفت آینده‌ای برای حساب شما ثبت نشده است.</p>}
            </article>
            <article className="home-overview-card">
              <div className="home-overview-heading"><div><span className="home-overview-icon announcements"><Megaphone size={17}/></span><div><strong>آخرین اطلاعیه‌ها</strong><small>{publishedAnnouncementCount} اطلاعیه منتشرشده</small></div></div><button className="text-link" onClick={() => go('اطلاعیه‌ها')}>همه اطلاعیه‌ها</button></div>
              {announcements.filter(item => item.is_published).slice(0,3).length ? <div className="home-announcement-list">{announcements.filter(item => item.is_published).slice(0,3).map(item => <button key={item.id} onClick={() => go('اطلاعیه‌ها')}><span className={item.priority === 'important' ? 'announcement-dot important' : 'announcement-dot'}/><span><strong>{item.title}</strong><small>{new Date(item.published_at || item.created_at).toLocaleDateString('fa-IR')}</small></span><ChevronLeft size={15}/></button>)}</div> : <p className="home-overview-empty">هنوز اطلاعیه‌ای منتشر نشده است.</p>}
            </article>
          </section>}
          {isAdmin && <section className="admin-home-summary"><div><span>درخواست‌های سازمانی در انتظار</span><strong>{adminPendingRequests}</strong><button onClick={() => go('مدیریت درخواست‌ها')}>بررسی درخواست‌ها <ChevronLeft size={14}/></button></div><div><span>درخواست‌های جابه‌جایی شیفت</span><strong>{adminPendingShiftChanges}</strong><button onClick={() => go('برنامه شیفت‌ها')}>مدیریت شیفت‌ها <ChevronLeft size={14}/></button></div></section>}
          <div className="section-heading"><div><h2>دسترسی سریع</h2><p>از بخش موردنظر خود شروع کنید.</p></div></div>
          <section className="quick-grid"><Quick icon={Users} title="فهرست همکاران" text="جست‌وجو و مشاهده همکاران" onClick={() => go('همکاران')} /><Quick icon={ArrowLeftRight} title="تبادل بخش یا بیمارستان" text="ثبت درخواست جابه‌جایی سازمانی" onClick={() => go('درخواست تبادل')} /><Quick icon={ClipboardList} title="پیگیری درخواست‌ها" text="مشاهده وضعیت درخواست‌های خود" onClick={() => go('درخواست‌های من')} /></section>
          <section className="notice"><div className="notice-icon"><Bell size={20} /></div><div><strong>اطلاعیه سامانه</strong><p>اطلاعات کارکنان و درخواست‌ها فقط پس از ورود معتبر و از پایگاه داده دریافت می‌شوند.</p></div></section>
        </>}
        {page === 'همکاران' && <section className="panel"><div className="panel-title"><div><h2>فهرست همکاران</h2><p>فهرست کارکنان فعال بیمارستان مدنی</p></div><span className="count-pill">{userEmail ? filtered.length : '—'} نفر</span></div>{!userEmail ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : <><div className="search-box"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجوی نام، سمت یا بخش..." /></div><div className="people-list">{filtered.map(c => <div className="person-row" key={c.id}><div className="avatar">{c.display_name?.slice(0, 1) || 'ک'}</div><div className="person-info"><strong>{c.display_name}</strong><span>{c.job_title || 'کارمند'}{c.department ? ' · بخش ' + c.department : ''}</span></div></div>)}</div>{filtered.length === 0 && <p className="demo-note">کارمند فعالی برای نمایش ثبت نشده است.</p>}</>}</section>}
        {page === 'درخواست تبادل' && <section className="panel form-panel"><div className="panel-title"><div><h2>درخواست تبادل بخش یا بیمارستان</h2><p>درخواست شما پس از ثبت برای بررسی مسئول مربوطه ارسال می‌شود.</p></div><div className="form-icon"><ArrowLeftRight /></div></div>{!userEmail ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : <form onSubmit={submitRequest}><label>نوع درخواست</label><div className="choice-row"><button type="button" className={kind === 'تبادل بخش' ? 'choice selected' : 'choice'} onClick={() => setKind('تبادل بخش')}>تبادل بخش</button><button type="button" className={kind === 'تبادل بیمارستان' ? 'choice selected' : 'choice'} onClick={() => setKind('تبادل بیمارستان')}>تبادل بیمارستان</button></div><div className="field-grid"><div><label htmlFor="from">بخش / محل فعلی</label><select id="from" value={from} onChange={e => setFrom(e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></div><div><label htmlFor="to">{kind === 'تبادل بیمارستان' ? 'نام بیمارستان مقصد' : 'بخش موردنظر'}</label>{kind === 'تبادل بیمارستان' ? <input id="to" required value={to} onChange={e => setTo(e.target.value)} placeholder="نام بیمارستان مقصد را وارد کنید" /> : <select id="to" value={to} onChange={e => setTo(e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select>}</div></div><label htmlFor="note">توضیحات و دلیل درخواست</label><textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="در صورت نیاز توضیحات تکمیلی را بنویسید..." rows={4} maxLength={1500} /><div className="form-actions"><span>اطلاعات درخواست فقط برای حساب شما و مدیران مجاز قابل مشاهده است.</span><button className="primary-btn" type="submit" disabled={busy}>{busy ? 'در حال ثبت...' : 'ثبت درخواست'} <ChevronLeft size={17} /></button></div></form>}</section>}
        {page === 'درخواست‌های من' && <section className="panel"><div className="panel-title"><div><h2>درخواست‌های من</h2><p>پیگیری درخواست‌های ثبت‌شده</p></div><button className="primary-btn" onClick={() => go('درخواست تبادل')}>درخواست جدید</button></div>{!userEmail ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : myRequests.length === 0 ? <div className="empty-state"><ClipboardList size={36} /><strong>هنوز درخواستی ثبت نکرده‌اید</strong><span>درخواست تبادل بخش یا بیمارستان خود را ثبت کنید.</span><button className="primary-btn" onClick={() => go('درخواست تبادل')}>ثبت درخواست</button></div> : <div className="request-list">{myRequests.map(r => <div className="request-row" key={r.id}><div className="request-symbol"><ArrowLeftRight /></div><div className="request-info"><strong>{r.request_type}</strong><span>{r.from_unit} ← {r.to_unit}</span>{r.note && <small>{r.note}</small>}<small>{new Date(r.created_at).toLocaleDateString('fa-IR')}</small></div><span className={r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : 'status-pending'}>{statusLabel(r.status)}</span></div>)}</div>}</section>}
        {page === 'اطلاعیه‌ها' && <section className="panel">
          <div className="panel-title"><div><h2>اطلاعیه‌های بیمارستان</h2><p>خبرها و پیام‌های رسمی برای کارکنان</p></div><span className="count-pill">{announcements.filter(a => a.is_published).length} منتشرشده</span></div>
          {isAdmin && <form className="announcement-form" onSubmit={createAnnouncement}>
            <h3>ثبت اطلاعیه جدید</h3>
            <label htmlFor="announcement-title">عنوان اطلاعیه</label>
            <input id="announcement-title" required maxLength={160} value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} placeholder="عنوان کوتاه و روشن" />
            <label htmlFor="announcement-body">متن اطلاعیه</label>
            <textarea id="announcement-body" required maxLength={5000} rows={4} value={announcementBody} onChange={e => setAnnouncementBody(e.target.value)} placeholder="متن اطلاعیه را بنویسید..." />
            <label htmlFor="announcement-priority">اهمیت</label>
            <select id="announcement-priority" value={announcementPriority} onChange={e => setAnnouncementPriority(e.target.value as 'normal' | 'important')}><option value="normal">عادی</option><option value="important">مهم</option></select>
            <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'در حال ذخیره...' : 'ذخیره پیش‌نویس'}</button>
          </form>}
          <div className="announcement-list">
            {announcements.filter(a => isAdmin || a.is_published).map(a => <article className="announcement-card" key={a.id}>
              <div className="announcement-head"><div><span className={a.priority === 'important' ? 'announcement-priority important' : 'announcement-priority'}>{a.priority === 'important' ? 'مهم' : 'اطلاعیه'}</span><h3>{a.title}</h3></div>{isAdmin && <span className={a.is_published ? 'status-approved' : 'status-pending'}>{a.is_published ? 'منتشرشده' : 'پیش‌نویس'}</span>}</div>
              <p>{a.body}</p><div className="announcement-foot"><small>{new Date(a.published_at || a.created_at).toLocaleDateString('fa-IR')}</small>{isAdmin && <button className="small-outline" disabled={busy} onClick={() => toggleAnnouncement(a)}>{a.is_published ? 'لغو انتشار' : 'انتشار'}</button>}</div>
            </article>)}
            {announcements.filter(a => isAdmin || a.is_published).length === 0 && <div className="empty-state"><Megaphone size={36}/><strong>هنوز اطلاعیه‌ای منتشر نشده است</strong><span>اطلاعیه‌های جدید در این بخش نمایش داده می‌شوند.</span></div>}
          </div>
        </section>}
        {page === 'پیام‌ها' && <section className="panel">
          <div className="panel-title"><div><h2>پیام‌رسان خصوصی کارکنان</h2><p>گفت‌وگوی مستقیم و محرمانه با همکاران</p></div><span className="count-pill">{unreadCount} خوانده‌نشده</span></div>
          {!userEmail ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : <div className="messenger-layout">
            <aside className="contact-list"><strong>گفت‌وگوها <small className="conversation-sort-hint">مرتب‌شده بر اساس آخرین پیام</small></strong><div className="contact-search"><Search size={16}/><input value={contactQuery} onChange={e => setContactQuery(e.target.value)} placeholder="جست‌وجوی نام یا متن پیام..." aria-label="جست‌وجوی همکار"/></div><div className="contact-filters" role="group" aria-label="فیلتر گفتگوها"><button type="button" className={contactFilter === 'all' ? 'active' : ''} onClick={() => setContactFilter('all')}>همه <b>{contactFilterCounts.all}</b></button><button type="button" className={contactFilter === 'unread' ? 'active' : ''} onClick={() => setContactFilter('unread')}>خوانده‌نشده <b>{contactFilterCounts.unread}</b></button><button type="button" className={contactFilter === 'messaged' ? 'active' : ''} onClick={() => setContactFilter('messaged')}>دارای پیام <b>{contactFilterCounts.messaged}</b></button><button type="button" className={contactFilter === 'new' ? 'active' : ''} onClick={() => setContactFilter('new')}>شروع گفتگو <b>{contactFilterCounts.new}</b></button></div>{sortedContacts.length ? Object.entries(groupedContacts).sort(([a],[b]) => a.localeCompare(b, 'fa')).map(([department, people]) => <section className="contact-department-group" key={department}><h4><span>{department}</span><b>{people.length}</b></h4>{people.map(c => <button key={c.id} className={selectedContact?.id === c.id ? 'contact-button selected' : 'contact-button'} onClick={() => loadThread(c)}><span className="avatar">{c.display_name?.slice(0,1) || 'ک'}</span><span className="contact-copy"><b>{c.display_name}</b><small>{inboxByContact.get(c.id)?.latest ? (inboxByContact.get(c.id)!.latest.deleted_at ? 'این پیام حذف شده است' : inboxByContact.get(c.id)!.latest.body || (inboxByContact.get(c.id)!.latest.attachment_name ? '📎 پیوست فایل' : 'گفت‌وگوی خصوصی')) : c.job_title || 'شروع گفت‌وگوی خصوصی'}</small></span><span className="contact-meta">{inboxByContact.get(c.id)?.latest && <time>{new Date(inboxByContact.get(c.id)!.latest.created_at).toLocaleDateString('fa-IR',{month:'numeric',day:'numeric'})}</time>}{Boolean(inboxByContact.get(c.id)?.unread) && <i>{inboxByContact.get(c.id)!.unread > 99 ? '99+' : inboxByContact.get(c.id)!.unread}</i>}</span></button>)}</section>) : <div className="contact-empty">{contactFilter === 'unread' ? 'گفت‌وگوی خوانده‌نشده‌ای وجود ندارد.' : contactFilter === 'messaged' ? 'هنوز گفت‌وگویی ثبت نشده است.' : contactFilter === 'new' ? 'همه همکاران قبلاً گفت‌وگو داشته‌اند.' : 'همکاری با این مشخصات پیدا نشد.'}</div>}</aside>
            <div className="chat-panel">
              {selectedContact ? <><div className="chat-heading"><div><strong>{selectedContact.display_name}</strong><small>{selectedContact.department || 'همکار بیمارستان مدنی'}</small></div><div className="thread-search"><Search size={15}/><input value={threadQuery} onChange={e => setThreadQuery(e.target.value)} placeholder="جست‌وجو در این گفت‌وگو..." aria-label="جست‌وجو در پیام‌های این گفتگو"/>{threadQuery && <button type="button" onClick={() => setThreadQuery('')} aria-label="پاک کردن جست‌وجو">×</button>}</div></div>
                <div className="chat-messages">{threadLoading ? <div className="empty-chat">در حال بارگذاری گفت‌وگو...</div> : filteredThreadMessages.length ? filteredThreadMessages.map(m => <div key={m.id} className={m.sender_id === profile?.id ? 'chat-bubble mine' : 'chat-bubble'}>{m.body && <p className={m.deleted_at ? 'message-deleted-text' : undefined}>{m.body}</p>}{!m.deleted_at && (m.attachments?.length ? m.attachments : m.attachment_path ? [{ path: m.attachment_path, name: m.attachment_name || 'فایل پیوست', type: m.attachment_type || 'application/octet-stream', size: m.attachment_size || 0 }] : []).map((file, fileIndex) => <button type="button" className="message-attachment" key={file.path || fileIndex} onClick={() => openMessageAttachment(m, file)}><span>{file.type.startsWith('image/') ? 'پیش‌نمایش تصویر' : 'فایل پیوست'}</span><b>{file.name}</b><small>{file.size ? (file.size / 1024 / 1024).toFixed(2) + ' مگابایت' : ''}</small></button>)}{m.sender_id === profile?.id && !m.deleted_at && <button type="button" className="message-delete-btn" disabled={busy} onClick={() => deleteOwnMessage(m)}>حذف پیام</button>}<small className="message-meta"><time>{new Date(m.created_at).toLocaleString('fa-IR')}</time>{m.sender_id === profile?.id && !m.deleted_at && <span className={m.read_at ? 'message-read-state is-read' : 'message-read-state'} aria-label={m.read_at ? 'پیام خوانده شده' : 'پیام ارسال شده'}>{m.read_at ? '✓✓ خوانده شد' : '✓ ارسال شد'}</span>}</small></div>) : <div className="empty-chat">{threadQuery ? 'پیامی با این عبارت پیدا نشد.' : 'هنوز پیامی در این گفت‌وگو وجود ندارد.'}</div>}</div>{attachmentPreview && <div className="attachment-preview-backdrop" role="presentation" onClick={() => setAttachmentPreview(null)}><section className="attachment-preview-modal" role="dialog" aria-modal="true" aria-label="پیش‌نمایش تصویر" onClick={e => e.stopPropagation()}><div><strong>{attachmentPreview.name}</strong><button type="button" className="icon-btn" aria-label="بستن پیش‌نمایش" onClick={() => setAttachmentPreview(null)}>×</button></div>{attachmentPreview.kind === 'image' ? <><img src={attachmentPreview.url} alt={attachmentPreview.name} />{(attachmentPreview.gallery?.length ?? 0) > 1 && <div className="image-gallery-controls"><button type="button" className="secondary-btn" disabled={(attachmentPreview.galleryIndex ?? 0) <= 0} onClick={() => { const index = (attachmentPreview.galleryIndex ?? 0) - 1; const item = attachmentPreview.gallery?.[index]; if (item) setAttachmentPreview(current => current ? { ...current, url: item.url, name: item.name, galleryIndex: index } : current) }}>تصویر قبلی</button><span>{((attachmentPreview.galleryIndex ?? 0) + 1).toLocaleString('fa-IR')} از {attachmentPreview.gallery.length.toLocaleString('fa-IR')}</span><button type="button" className="secondary-btn" disabled={(attachmentPreview.galleryIndex ?? 0) >= attachmentPreview.gallery.length - 1} onClick={() => { const index = (attachmentPreview.galleryIndex ?? 0) + 1; const item = attachmentPreview.gallery?.[index]; if (item) setAttachmentPreview(current => current ? { ...current, url: item.url, name: item.name, galleryIndex: index } : current) }}>تصویر بعدی</button></div>}</> : attachmentPreview.kind === 'pdf' ? <iframe className="attachment-pdf-frame" src={attachmentPreview.url} title={attachmentPreview.name} /> : attachmentPreview.docText !== undefined ? <div className="word-preview"><div className="word-preview-toolbar"><strong>پیش‌نمایش متن سند Word</strong><span>نمایش متن ساده</span></div><pre dir="auto">{attachmentPreview.docText}</pre>{attachmentPreview.docTruncated && <small className="excel-preview-note">برای حفظ سرعت، متن پیش‌نمایش به ۱۵ هزار نویسه محدود شده است.</small>}<a className="primary-btn attachment-download-btn" href={attachmentPreview.url} target="_blank" rel="noopener noreferrer" download={attachmentPreview.name}><Download size={16} /> دریافت فایل Word</a></div> : attachmentPreview.rows ? <div className="excel-preview"><div className="excel-preview-toolbar"><strong>{attachmentPreview.sheetName}</strong><span>نمایش {attachmentPreview.rows.length.toLocaleString('fa-IR')} ردیف از {attachmentPreview.totalRows?.toLocaleString('fa-IR')}</span></div><div className="excel-preview-scroll"><table><tbody>{attachmentPreview.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{cell || '—'}</th> : <td key={cellIndex}>{cell || '—'}</td>)}</tr>)}</tbody></table></div>{attachmentPreview.truncated && <small className="excel-preview-note">برای حفظ سرعت، پیش‌نمایش به ۱۰۰ ردیف و ۲۰ ستون محدود شده است.</small>}<a className="primary-btn attachment-download-btn" href={attachmentPreview.url} target="_blank" rel="noopener noreferrer" download={attachmentPreview.name}><Download size={16} /> دریافت فایل کامل</a></div> : <div className="attachment-file-fallback"><div className="attachment-file-icon"><FileText size={30} /></div><strong>{attachmentPreview.mime?.includes('spreadsheet') ? 'فایل صفحه‌گسترده Excel' : attachmentPreview.mime?.includes('wordprocessing') ? 'سند Word' : attachmentPreview.mime === 'text/plain' ? 'فایل متنی' : 'فایل پیوست'}</strong><p>مرورگر امکان نمایش مستقیم این قالب را در پنجره گفتگو ندارد. می‌توانید فایل را با حفظ دسترسی خصوصی دریافت کنید.</p>{typeof attachmentPreview.size === 'number' && <small>حجم فایل: {(attachmentPreview.size / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} کیلوبایت</small>}<a className="primary-btn attachment-download-btn" href={attachmentPreview.url} target="_blank" rel="noopener noreferrer" download={attachmentPreview.name}><Download size={16} /> دریافت فایل</a></div>}<small>پیوند فایل خصوصی و موقت است و پس از ۵ دقیقه منقضی می‌شود.</small></section></div>}
                <form className="chat-compose" onSubmit={sendDirectMessage}><textarea value={messageDraft} onChange={e => setMessageDraft(e.target.value)} maxLength={4000} rows={2} placeholder="پیام خود را بنویسید..." /><div className="chat-compose-tools"><label className="attachment-picker">＋ افزودن فایل‌ها<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.docx,.xlsx" onChange={e => { const picked = Array.from(e.target.files ?? []); setMessageAttachments(current => [...current, ...picked].slice(0, 5)); e.currentTarget.value = "" }} /></label>{messageAttachments.map((file, index) => <span className="attachment-selected" key={file.name + file.size + index}>{file.name}<button type="button" aria-label="حذف پیوست" onClick={() => setMessageAttachments(current => current.filter((_, i) => i !== index))}>×</button></span>)}<small>{messageAttachments.length}/۵ فایل · مجموع {(messageAttachments.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} از ۱۰ مگابایت</small><button className="primary-btn" disabled={busy || (!messageDraft.trim() && !messageAttachments.length)}>{busy ? 'در حال ارسال...' : 'ارسال پیام'}</button></div></form>
              </> : <div className="empty-state"><Users size={34}/><strong>یک همکار را انتخاب کنید</strong><span>برای شروع گفت‌وگوی خصوصی، نام همکار را از فهرست انتخاب کنید.</span></div>}
            </div>
          </div>}
        </section>}
        {page === 'مدیریت درخواست‌ها' && <section className="panel"><div className="panel-title"><div><h2>مدیریت درخواست‌های تبادل</h2><p>بررسی و تعیین نتیجه درخواست‌های کارکنان</p></div><span className="count-pill">{requests.filter(r => r.status === 'pending').length} در انتظار</span></div>{!isAdmin ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : requests.length === 0 ? <div className="empty-state"><ClipboardList size={36}/><strong>درخواستی برای بررسی وجود ندارد</strong></div> : <div className="request-list">{requests.map(r => <div className="request-row" key={r.id}><div className="request-symbol"><ArrowLeftRight/></div><div className="request-info"><strong>{r.request_type} · {employeeNames[r.employee_id || ''] || 'کارمند'}</strong><span>{r.from_unit} ← {r.to_unit}</span>{r.note && <small>{r.note}</small>}<small>{new Date(r.created_at).toLocaleDateString('fa-IR')}</small></div><span className={r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : 'status-pending'}>{statusLabel(r.status)}</span>{r.status === 'pending' && <div className="review-actions"><button className="approve-btn" disabled={busy} onClick={() => reviewRequest(r.id, 'approved')}>تأیید</button><button className="reject-btn" disabled={busy} onClick={() => reviewRequest(r.id, 'rejected')}>رد</button></div>}</div>)}</div>}</section>}
        {page === 'برنامه شیفت‌ها' && <section className="panel shift-panel"><div className="panel-title"><div><h2>برنامه کاری و شیفت‌ها</h2><p>برنامه شیفت‌های آینده و درخواست جابه‌جایی با تأیید مدیر</p></div><span className="count-pill">{workShifts.length} شیفت</span></div>{!userEmail ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : <>
          {isAdmin && <form className="shift-create-form" onSubmit={createWorkShift}><h3>ثبت شیفت جدید</h3><div className="field-grid"><div><label htmlFor="shift-employee">کارمند</label><select id="shift-employee" required value={shiftEmployeeId} onChange={e => setShiftEmployeeId(e.target.value)}><option value="">انتخاب کارمند</option>{colleagues.filter(person => person.is_active !== false).map(person => <option key={person.id} value={person.id}>{person.display_name} · {person.department || 'بدون بخش'}</option>)}</select></div><div><label htmlFor="shift-department">بخش</label><select id="shift-department" value={shiftDepartment} onChange={e => setShiftDepartment(e.target.value)}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></div></div><div className="field-grid"><div><label htmlFor="shift-date">تاریخ</label><input id="shift-date" type="date" min={new Date().toISOString().slice(0, 10)} required value={shiftDate} onChange={e => setShiftDate(e.target.value)} /></div><div><label htmlFor="shift-type">نوع شیفت</label><select id="shift-type" value={shiftType} onChange={e => { const value=e.target.value as 'morning'|'evening'|'night'; setShiftType(value); setShiftStartsAt(value==='morning'?'07:00':value==='evening'?'15:00':'23:00'); setShiftEndsAt(value==='morning'?'15:00':value==='evening'?'23:00':'07:00') }}><option value="morning">صبح</option><option value="evening">عصر</option><option value="night">شب</option></select></div></div><div className="field-grid"><div><label htmlFor="shift-start">شروع</label><input id="shift-start" type="time" required value={shiftStartsAt} onChange={e => setShiftStartsAt(e.target.value)} /></div><div><label htmlFor="shift-end">پایان</label><input id="shift-end" type="time" required value={shiftEndsAt} onChange={e => setShiftEndsAt(e.target.value)} /></div></div><label htmlFor="shift-notes">توضیحات (اختیاری)</label><input id="shift-notes" maxLength={500} value={shiftNotes} onChange={e => setShiftNotes(e.target.value)} placeholder="توضیح کوتاه برای شیفت" /><button className="primary-btn" disabled={busy}>{busy ? 'در حال ثبت...' : 'ثبت در برنامه کاری'}</button></form>}
           <section className="shift-calendar" aria-label="تقویم ماهانه شیفت‌ها">
             <div className="shift-calendar-toolbar">
               <div><h3>تقویم ماهانه</h3><span>{calendarMonthShifts.length} شیفت در این ماه</span></div>
               <div className="shift-calendar-actions">
                 <button type="button" className="small-outline" onClick={() => { setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1)); resetShiftReportFilters() }} aria-label="ماه قبل"><ChevronLeft size={16}/></button>
                 <strong>{calendarMonth.toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' })}</strong>
                 <button type="button" className="small-outline calendar-next" onClick={() => { setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1)); resetShiftReportFilters() }} aria-label="ماه بعد"><ChevronLeft size={16}/></button>
                 <button type="button" className="primary-btn calendar-export" onClick={exportShiftCalendar} disabled={filteredReportShifts.length === 0}>خروجی گزارش</button>
               </div>
             </div>
             <div className="shift-report-filters" aria-label="فیلتر گزارش شیفت‌ها">
               <label>بخش<select value={reportDepartment} onChange={e => setReportDepartment(e.target.value)}><option value="all">همه بخش‌ها</option>{reportDepartments.map(department => <option key={department} value={department}>{department}</option>)}</select></label>
               <label>نوع شیفت<select value={reportShiftType} onChange={e => setReportShiftType(e.target.value)}><option value="all">همه شیفت‌ها</option><option value="morning">صبح</option><option value="evening">عصر</option><option value="night">شب</option></select></label>
               <label>کارمند<select value={reportEmployee} onChange={e => setReportEmployee(e.target.value)}><option value="all">همه کارکنان</option>{reportEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
               <button type="button" className="small-outline" onClick={resetShiftReportFilters} disabled={reportDepartment === 'all' && reportShiftType === 'all' && reportEmployee === 'all'}>پاک‌کردن فیلترها</button>
             </div>
             <div className="shift-month-summary" aria-label="گزارش آماری شیفت‌های ماه">
               <div className="shift-summary-total"><span>مجموع شیفت‌ها</span><strong>{monthlyShiftStats.total}</strong><small>{monthlyShiftStats.employees} کارمند برنامه‌ریزی‌شده</small></div>
               <div className="shift-summary-item morning"><span>شیفت صبح</span><strong>{monthlyShiftStats.morning}</strong></div>
               <div className="shift-summary-item evening"><span>شیفت عصر</span><strong>{monthlyShiftStats.evening}</strong></div>
               <div className="shift-summary-item night"><span>شیفت شب</span><strong>{monthlyShiftStats.night}</strong></div>
             </div>
             {monthlyShiftStats.departments.length > 0 && <div className="shift-department-report"><strong>توزیع شیفت بر اساس بخش</strong><div>{monthlyShiftStats.departments.map(([department, count]) => <span key={department}>{department}<b>{count}</b></span>)}</div></div>}
             <div className="shift-analytics-grid">
               <section className="shift-chart-card">
                 <div className="shift-chart-heading"><strong>روند روزانه شیفت‌ها</strong><span>بر اساس فیلترهای فعال</span></div>
                 {dailyShiftStats.length === 0 ? <p className="shift-chart-empty">داده‌ای برای نمایش وجود ندارد.</p> : <div className="shift-daily-chart" role="img" aria-label="نمودار تعداد شیفت‌ها در روزهای ماه">{dailyShiftStats.map(([day, count]) => {
                   const max = Math.max(...dailyShiftStats.map(item => item[1]), 1)
                   return <div className="shift-daily-column" key={day} title={new Date(day+'T12:00:00').toLocaleDateString('fa-IR')+' · '+count+' شیفت'}><strong>{count}</strong><span style={{height: Math.max(5, count / max * 100) + '%'}}/><small>{new Date(day+'T12:00:00').toLocaleDateString('fa-IR',{day:'numeric'})}</small></div>
                 })}</div>}
               </section>
               <section className="shift-chart-card">
                 <div className="shift-chart-heading"><strong>کارکنان با بیشترین شیفت</strong><span>۶ نفر اول</span></div>
                 {employeeShiftStats.length === 0 ? <p className="shift-chart-empty">داده‌ای برای نمایش وجود ندارد.</p> : <div className="shift-employee-bars">{employeeShiftStats.map(item => <div className="shift-employee-bar" key={item.id}><div><span>{item.name}</span><b>{item.count}</b></div><span className="shift-employee-track"><i style={{width: (item.count / employeeShiftStats[0].count * 100) + '%'}}/></span></div>)}</div>}
               </section>
             </div>
             <div className="shift-calendar-grid shift-calendar-weekdays">{['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].map(day => <div key={day}>{day}</div>)}</div>
             <div className="shift-calendar-grid shift-calendar-days">{calendarCells.map((cell, index) => cell ? <div className={'shift-calendar-day' + (cell.key === dateKey(new Date()) ? ' today' : '')} key={cell.key}>
               <strong>{cell.date.toLocaleDateString('fa-IR', { day: 'numeric' })}</strong>
               {cell.shifts.slice(0, 3).map(shift => <span className={'calendar-shift '+shift.shift_type} key={shift.id} title={colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند'}>{(colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند').split(' ')[0]} · {shiftTypeLabel(shift.shift_type)}</span>)}
               {cell.shifts.length > 3 && <small>+{cell.shifts.length - 3} شیفت دیگر</small>}
             </div> : <div className="shift-calendar-day blank" key={'blank-'+index} />)}</div>
             <p className="calendar-export-note">خروجی بر اساس فیلترهای انتخاب‌شده تهیه می‌شود و با Excel قابل بازکردن است. {filteredReportShifts.length} ردیف در گزارش</p>
           </section>
          <div className="shift-roster-heading"><h3>شیفت‌های آینده</h3><span>نمایش برنامه ثبت‌شده برای کارکنان فعال</span></div>{workShifts.length === 0 ? <div className="empty-state"><CalendarDays size={34}/><strong>شیفتی برای نمایش ثبت نشده است</strong><span>پس از ثبت برنامه توسط مدیر، شیفت‌ها در این قسمت نمایش داده می‌شوند.</span></div> : <div className="shift-roster">{workShifts.map(shift => { const owner=colleagues.find(person=>person.id===shift.employee_id); return <article className="shift-card" key={shift.id}><div className="shift-date-block"><strong>{new Date(shift.shift_date+'T12:00:00').toLocaleDateString('fa-IR',{day:'numeric'})}</strong><span>{new Date(shift.shift_date+'T12:00:00').toLocaleDateString('fa-IR',{month:'long',weekday:'short'})}</span></div><div className="shift-card-main"><strong>{owner?.display_name || 'کارمند'}</strong><span>{shift.department} · شیفت {shiftTypeLabel(shift.shift_type)}</span><small>{shift.starts_at.slice(0,5)} تا {shift.ends_at.slice(0,5)}{shift.notes ? ' · '+shift.notes : ''}</small></div><span className={'shift-type-pill '+shift.shift_type}>{shiftTypeLabel(shift.shift_type)}</span></article> })}</div>}
          {profile && <form className="shift-swap-form" onSubmit={requestShiftSwap}><h3>درخواست جابه‌جایی شیفت</h3><p>شیفت خود را با شیفت همکار دیگری انتخاب کنید. تغییر برنامه فقط پس از تأیید مدیر اعمال می‌شود.</p><label htmlFor="swap-from">شیفت خودم</label><select id="swap-from" required value={swapFromId} onChange={e=>setSwapFromId(e.target.value)}><option value="">انتخاب شیفت خودتان</option>{workShifts.filter(shift=>shift.employee_id===profile.id).map(shift=><option key={shift.id} value={shift.id}>{new Date(shift.shift_date+'T12:00:00').toLocaleDateString('fa-IR')} · {shiftTypeLabel(shift.shift_type)} · {shift.starts_at.slice(0,5)}</option>)}</select><label htmlFor="swap-to">شیفت همکار</label><select id="swap-to" required value={swapToId} onChange={e=>setSwapToId(e.target.value)}><option value="">انتخاب شیفت همکار</option>{workShifts.filter(shift=>shift.employee_id!==profile.id).map(shift=><option key={shift.id} value={shift.id}>{colleagues.find(person=>person.id===shift.employee_id)?.display_name || 'همکار'} · {new Date(shift.shift_date+'T12:00:00').toLocaleDateString('fa-IR')} · {shiftTypeLabel(shift.shift_type)}</option>)}</select><label htmlFor="swap-note">توضیح (اختیاری)</label><textarea id="swap-note" rows={2} maxLength={1000} value={swapNote} onChange={e=>setSwapNote(e.target.value)} placeholder="دلیل یا توضیح درخواست"/><button className="primary-btn" disabled={busy || !workShifts.some(s=>s.employee_id===profile.id)}>{busy?'در حال ارسال...':'ارسال درخواست جابه‌جایی'}</button></form>}
          <div className="shift-roster-heading"><h3>{isAdmin?'درخواست‌های جابه‌جایی کارکنان':'درخواست‌های جابه‌جایی من'}</h3></div>{shiftChangeRequests.filter(item=>isAdmin || item.requester_id===profile?.id).length===0 ? <p className="demo-note">درخواستی ثبت نشده است.</p> : <div className="request-list">{shiftChangeRequests.filter(item=>isAdmin || item.requester_id===profile?.id).map(item=>{const fromShift=workShifts.find(s=>s.id===item.from_shift_id);const toShift=workShifts.find(s=>s.id===item.to_shift_id);return <article className="request-row" key={item.id}><div className="request-symbol"><ArrowLeftRight/></div><div className="request-info"><strong>{colleagues.find(person=>person.id===item.requester_id)?.display_name || 'کارمند'} · درخواست جابه‌جایی</strong><span>{fromShift?new Date(fromShift.shift_date+'T12:00:00').toLocaleDateString('fa-IR'):'شیفت مبدأ'} ↔ {toShift?new Date(toShift.shift_date+'T12:00:00').toLocaleDateString('fa-IR'):'شیفت مقصد'}</span>{item.note&&<small>{item.note}</small>}<small>{new Date(item.created_at).toLocaleDateString('fa-IR')}</small></div><span className={item.status==='approved'?'status-approved':item.status==='rejected'?'status-rejected':'status-pending'}>{statusLabel(item.status)}</span>{isAdmin&&item.status==='pending'&&<div className="review-actions"><button className="approve-btn" disabled={busy} onClick={()=>reviewShiftSwap(item.id,'approved')}>تأیید و جابه‌جایی</button><button className="reject-btn" disabled={busy} onClick={()=>reviewShiftSwap(item.id,'rejected')}>رد</button></div>}</article>})}</div>}
        </>}</section>}
        {page === 'سجل فعالیت‌ها' && <section className="panel"><div className="panel-title"><div><h2>سجل فعالیت‌های مدیریتی</h2><p>آخرین رویدادهای مهم ثبت‌شده در پایگاه داده؛ فقط برای مدیران مجاز</p></div><span className="count-pill">{auditEntries.length} رویداد</span></div>{!isAdmin ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : auditEntries.length === 0 ? <div className="empty-state"><History size={36}/><strong>هنوز رویدادی ثبت نشده است</strong><span>تغییر مشخصات کارکنان، بررسی درخواست‌ها و انتشار اطلاعیه‌ها در این بخش ثبت می‌شوند.</span></div> : <div className="request-list">{auditEntries.map(entry => <article className="audit-row" key={entry.id}><div className="request-symbol"><History size={18}/></div><div className="request-info"><strong>{auditActionLabel(entry.action)}</strong><span>{entry.entity_type === 'employee_profiles' ? 'پرونده کارکنان' : entry.entity_type === 'exchange_requests' ? 'درخواست تبادل' : 'اطلاعیه بیمارستان'}</span><small>شناسه هدف: {entry.target_id ? entry.target_id.slice(0, 8) : 'نامشخص'} · عامل: {entry.actor_id ? entry.actor_id.slice(0, 8) : 'سامانه'}</small>{Array.isArray(entry.details.changed_fields) && <small>فیلدهای تغییرکرده: {(entry.details.changed_fields as string[]).join('، ')}</small>}</div><time>{new Date(entry.created_at).toLocaleString('fa-IR')}</time></article>)}</div>}</section>}
        {page === 'مدیریت کارکنان' && <section className="panel"><div className="panel-title"><div><h2>مدیریت کارکنان</h2><p>ویرایش اطلاعات پرسنلی و کنترل وضعیت حساب‌های کارکنان</p></div><span className="count-pill">{colleagues.length} حساب</span></div>{!isAdmin ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : <><div className="employee-admin-summary"><div><strong>{activeEmployeeCount}</strong><span>کارمند فعال</span></div><div><strong>{inactiveEmployeeCount}</strong><span>حساب غیرفعال</span></div></div><div className="employee-admin-toolbar"><label className="employee-admin-search"><Search size={17}/><input value={employeeQuery} onChange={e => setEmployeeQuery(e.target.value)} placeholder="جست‌وجوی نام، سمت یا بخش..." aria-label="جست‌وجوی کارکنان" /></label><select value={employeeStatusFilter} onChange={e => setEmployeeStatusFilter(e.target.value as 'all' | 'active' | 'inactive')} aria-label="فیلتر وضعیت کارکنان"><option value="all">همه کارکنان</option><option value="active">فقط فعال‌ها</option><option value="inactive">فقط غیرفعال‌ها</option></select></div><div className="people-list employee-admin-list">{filteredEmployees.map(employee => <div className="employee-admin-row" key={employee.id}><div className="employee-admin-person"><div className="avatar">{employee.display_name?.slice(0, 1) || 'ک'}</div><div className="person-info"><strong>{employee.display_name}</strong><span>{employee.job_title || 'سمت ثبت نشده'}{employee.department ? ' · ' + employee.department : ''}</span></div></div><span className={employee.is_active === false ? 'employee-state inactive' : 'employee-state'}>{employee.is_active === false ? 'غیرفعال' : 'فعال'}</span><div className="employee-admin-actions"><button className="small-outline" disabled={busy} onClick={() => beginEmployeeEdit(employee)}>ویرایش مشخصات</button>{employee.id !== profile?.id && <button className={employee.is_active === false ? 'approve-btn' : 'reject-btn'} disabled={busy} onClick={() => toggleEmployeeActive(employee)}>{employee.is_active === false ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</button>}</div></div>)}</div>{filteredEmployees.length === 0 && <div className="empty-state"><Users size={34}/><strong>{colleagues.length === 0 ? 'کارمندی ثبت نشده است' : 'کارمندی با این جست‌وجو پیدا نشد'}</strong><span>عبارت جست‌وجو یا فیلتر وضعیت را تغییر دهید.</span></div>}{editingEmployee && <form className="employee-edit-form" onSubmit={saveEmployee}><div className="panel-title"><div><h3>ویرایش اطلاعات {editingEmployee.display_name}</h3><p>نقش مدیریتی و شناسه حساب از این فرم قابل تغییر نیست.</p></div><button type="button" className="small-outline" onClick={() => setEditingEmployee(null)}>انصراف</button></div><label htmlFor="employee-name">نام و نام خانوادگی</label><input id="employee-name" required maxLength={120} value={employeeNameDraft} onChange={e => setEmployeeNameDraft(e.target.value)} /><div className="field-grid"><div><label htmlFor="employee-department">بخش</label><input id="employee-department" maxLength={100} value={employeeDepartmentDraft} onChange={e => setEmployeeDepartmentDraft(e.target.value)} placeholder="نام بخش" /></div><div><label htmlFor="employee-title">سمت سازمانی</label><input id="employee-title" maxLength={120} value={employeeTitleDraft} onChange={e => setEmployeeTitleDraft(e.target.value)} placeholder="سمت کارمند" /></div></div><button className="primary-btn" disabled={busy}>{busy ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</button></form>}</>}</section>}
        {page === 'پروفایل' && <section className="panel profile-panel"><div className="profile-avatar"><UserRound size={34} /></div><h2>{profile?.display_name || 'پروفایل کارمند'}</h2><p>{profile ? [profile.job_title, profile.department].filter(Boolean).join(' · ') : userEmail || 'برای مشاهده اطلاعات پروفایل وارد سامانه شوید.'}</p>{userEmail ? <button className="primary-btn" onClick={logout}><LogOut size={16} /> خروج از حساب</button> : <button className="primary-btn" onClick={() => setShowLogin(true)}>ورود کارکنان</button>}</section>}
        <footer className="footer">شهروند مدنی <span>·</span> سامانه جامعه دیجیتال کارکنان بیمارستان مدنی</footer>
      </main>
    </div>
    {showLogin && <div className="modal-backdrop" onClick={() => setShowLogin(false)}><form className="login-modal" onSubmit={login} onClick={e => e.stopPropagation()}><button type="button" className="close-btn" onClick={() => setShowLogin(false)} aria-label="بستن"><X /></button><div className="login-visual"><div className="login-visual-mark"><Building2 size={34}/></div><span>جامعه دیجیتال کارکنان</span><strong>شهروند مدنی</strong><small>ارتباط آسان‌تر، همکاری مؤثرتر</small><div className="login-orbit login-orbit-one"/><div className="login-orbit login-orbit-two"/></div><div className="login-form-heading"><div className="modal-icon"><ShieldCheck /></div><div><h2>خوش آمدید</h2><p>برای ورود به فضای اختصاصی کارکنان، اطلاعات حساب سازمانی خود را وارد کنید.</p></div></div><label htmlFor="login-email">ایمیل سازمانی</label><input id="login-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@hospital.ir" /><label htmlFor="login-password">رمز عبور</label><input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور" /><button className="primary-btn full" disabled={busy || !configured}>{busy ? 'در حال بررسی...' : 'ورود امن به سامانه'}</button><small>ساخت و تأیید حساب کارکنان توسط مسئول سامانه انجام می‌شود.</small></form></div>}
  </div>
}

function shiftTypeLabel(type: string) { return type === 'morning' ? 'صبح' : type === 'evening' ? 'عصر' : 'شب' }
function auditActionLabel(action: string) { return action === 'employee_profile_updated' ? 'ویرایش اطلاعات کارمند' : action === 'exchange_request_reviewed' ? 'بررسی و تعیین وضعیت درخواست' : action === 'announcement_published' ? 'انتشار اطلاعیه' : action === 'announcement_unpublished' ? 'لغو انتشار اطلاعیه' : 'رویداد مدیریتی' }
function statusLabel(status: string) { return status === 'approved' ? 'تأیید شده' : status === 'rejected' ? 'رد شده' : 'در انتظار بررسی' }
function LoginPrompt({ onLogin }: { onLogin: () => void }) { return <div className="empty-state"><ShieldCheck size={34} /><strong>ورود به سامانه الزامی است</strong><span>برای مشاهده اطلاعات کارکنان یا ثبت درخواست وارد حساب خود شوید.</span><button className="primary-btn" onClick={onLogin}>ورود کارکنان</button></div> }
function Stat({ icon: Icon, value, label, hint }: any) { return <div className="stat-card"><div className="stat-icon"><Icon size={20} /></div><div><strong>{value}</strong><span>{label}</span><small>{hint}</small></div></div> }
function Quick({ icon: Icon, title, text, onClick }: any) { return <button className="quick-card" onClick={onClick}><div className="quick-icon"><Icon size={22} /></div><div><strong>{title}</strong><span>{text}</span></div><ChevronLeft size={18} className="quick-arrow" /></button> }
export default App
