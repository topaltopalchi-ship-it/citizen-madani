import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeftRight, Bell, Building2, CalendarDays, ChevronLeft, ClipboardList, HeartHandshake, Home, LogIn, LogOut, Menu, Search, ShieldCheck, UserRound, Users, X, Megaphone, History } from 'lucide-react'
import { supabase } from './lib/supabase'

type Page = 'خانه' | 'همکاران' | 'درخواست تبادل' | 'درخواست‌های من' | 'پروفایل' | 'مدیریت درخواست‌ها' | 'مدیریت کارکنان' | 'سجل فعالیت‌ها' | 'برنامه شیفت‌ها' | 'اطلاعیه‌ها' | 'پیام‌ها'
type Profile = { id: string; display_name: string; department: string | null; job_title: string | null; role?: string; is_active?: boolean }
type ExchangeRequest = { id: string; employee_id?: string; request_type: string; from_unit: string; to_unit: string; note: string | null; status: string; created_at: string }
type Announcement = { id: string; title: string; body: string; priority: 'normal' | 'important'; is_published: boolean; created_at: string; published_at: string | null }
type DirectMessage = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }
type AuditEntry = { id: number; actor_id: string | null; target_id: string | null; entity_type: string; action: string; details: Record<string, unknown>; created_at: string }
type WorkShift = { id: string; employee_id: string; shift_date: string; shift_type: 'morning' | 'evening' | 'night'; starts_at: string; ends_at: string; department: string; notes: string | null; created_at: string }
type ShiftChangeRequest = { id: string; requester_id: string; from_shift_id: string; to_shift_id: string; note: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string }

const units = ['اورژانس', 'داخلی', 'جراحی', 'ICU', 'آزمایشگاه', 'رادیولوژی', 'داروخانه', 'پذیرش', 'سایر']
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
  const [threadLoading, setThreadLoading] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const threadLoadSequence = useRef(0)
  const [messageDraft, setMessageDraft] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([])
  const [shiftChangeRequests, setShiftChangeRequests] = useState<ShiftChangeRequest[]>([])
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
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
  const exportShiftCalendar = () => {
    const rows = [['تاریخ', 'نام کارمند', 'بخش', 'نوع شیفت', 'ساعت شروع', 'ساعت پایان', 'توضیحات']]
    calendarMonthShifts.forEach(shift => rows.push([
      shift.shift_date, colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند',
      shift.department, shiftTypeLabel(shift.shift_type), shift.starts_at.slice(0, 5), shift.ends_at.slice(0, 5), shift.notes || ''
    ]))
    const csv = '\uFEFF' + rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `shift-calendar-${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}.csv`
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const activeEmployeeCount = colleagues.filter(employee => employee.is_active !== false).length
  const inactiveEmployeeCount = colleagues.length - activeEmployeeCount
  const filteredContacts = useMemo(() => colleagues.filter(c => c.id !== profile?.id &&
    [c.display_name, c.job_title, c.department].filter(Boolean).join(' ').toLowerCase().includes(contactQuery.toLowerCase())
  ), [colleagues, profile?.id, contactQuery])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      setUserEmail(data.session?.user.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      if (!session) { setProfile(null); setRequests([]); setSelectedContact(null); setThreadMessages([]); setMessageDraft(''); setUnreadCount(0); threadLoadSequence.current += 1; setThreadLoading(false) }
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
        client.from('work_shifts').select('id,employee_id,shift_date,shift_type,starts_at,ends_at,department,notes,created_at').gte('shift_date', new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).toISOString().slice(0, 10)).lte('shift_date', new Date(new Date().getFullYear() + 1, new Date().getMonth() + 1, 0).toISOString().slice(0, 10)).order('shift_date').order('starts_at').limit(1500),
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
      const { count } = await client.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null)
      if (active) setUnreadCount(count ?? 0)
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
          const readAt = new Date().toISOString()
          void client.from('direct_messages').update({ read_at: readAt })
            .eq('id', incoming.id).eq('recipient_id', profile.id)
          setThreadMessages(current => current.map(m => m.id === incoming.id ? { ...m, read_at: readAt } : m))
        } else {
          setUnreadCount(current => current + 1)
          setMessage('یک پیام جدید دریافت کردید.')
        }
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
    else { setPage('خانه'); setSelectedContact(null); setThreadMessages([]); setMessageDraft(''); setContactQuery(''); setMessage('از حساب کاربری خارج شدید.') }
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
    setSelectedContact(contact); setThreadMessages([]); setThreadLoading(true); setError('')
    const { data, error: loadError } = await supabase.from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at')
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
        setUnreadCount(current => Math.max(0, current - unreadIds.length))
      }
    }
    if (sequence === threadLoadSequence.current) setThreadLoading(false)
  }

  const sendDirectMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !profile || !selectedContact || !messageDraft.trim()) return
    setBusy(true); setError('')
    const { data, error: sendError } = await supabase.from('direct_messages').insert({
      sender_id: profile.id, recipient_id: selectedContact.id, body: messageDraft.trim(),
    }).select('id,sender_id,recipient_id,body,created_at,read_at').single()
    if (sendError) setError('ارسال پیام انجام نشد. اتصال و دسترسی حساب را بررسی کنید.')
    else { setThreadMessages(current => [...current, data]); setMessageDraft(''); setMessage('پیام ارسال شد.') }
    setBusy(false)
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
          <section className="stats-grid"><Stat icon={Users} value={userEmail ? String(colleagues.length) : '—'} label="اعضای جامعه" hint="کارکنان فعال ثبت‌شده" /><Stat icon={ArrowLeftRight} value={userEmail ? String(myRequests.length) : '—'} label="درخواست‌های من" hint="درخواست‌های ثبت‌شده حساب شما" /><Stat icon={Activity} value={configured ? 'متصل' : 'نیازمند تنظیم'} label="وضعیت سامانه" hint="وضعیت اتصال پایگاه داده" /></section>
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
            <aside className="contact-list"><strong>انتخاب همکار</strong><div className="contact-search"><Search size={16}/><input value={contactQuery} onChange={e => setContactQuery(e.target.value)} placeholder="جست‌وجوی همکار..." aria-label="جست‌وجوی همکار"/></div>{filteredContacts.map(c => <button key={c.id} className={selectedContact?.id === c.id ? 'contact-button selected' : 'contact-button'} onClick={() => loadThread(c)}><span className="avatar">{c.display_name?.slice(0,1) || 'ک'}</span><span><b>{c.display_name}</b><small>{c.department || c.job_title || 'کارمند'}</small></span></button>)}</aside>
            <div className="chat-panel">
              {selectedContact ? <><div className="chat-heading"><strong>{selectedContact.display_name}</strong><small>{selectedContact.department || 'همکار بیمارستان مدنی'}</small></div>
                <div className="chat-messages">{threadLoading ? <div className="empty-chat">در حال بارگذاری گفت‌وگو...</div> : threadMessages.length ? threadMessages.map(m => <div key={m.id} className={m.sender_id === profile?.id ? 'chat-bubble mine' : 'chat-bubble'}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString('fa-IR')}</small></div>) : <div className="empty-chat">هنوز پیامی در این گفت‌وگو وجود ندارد.</div>}</div>
                <form className="chat-compose" onSubmit={sendDirectMessage}><textarea value={messageDraft} onChange={e => setMessageDraft(e.target.value)} maxLength={4000} rows={2} placeholder="پیام خود را بنویسید..." /><button className="primary-btn" disabled={busy || !messageDraft.trim()}>{busy ? 'در حال ارسال...' : 'ارسال پیام'}</button></form>
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
                 <button type="button" className="small-outline" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="ماه قبل"><ChevronLeft size={16}/></button>
                 <strong>{calendarMonth.toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' })}</strong>
                 <button type="button" className="small-outline calendar-next" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="ماه بعد"><ChevronLeft size={16}/></button>
                 <button type="button" className="primary-btn calendar-export" onClick={exportShiftCalendar} disabled={calendarMonthShifts.length === 0}>خروجی Excel</button>
               </div>
             </div>
             <div className="shift-calendar-grid shift-calendar-weekdays">{['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].map(day => <div key={day}>{day}</div>)}</div>
             <div className="shift-calendar-grid shift-calendar-days">{calendarCells.map((cell, index) => cell ? <div className={'shift-calendar-day' + (cell.key === new Date().toLocaleDateString('en-CA') ? ' today' : '')} key={cell.key}>
               <strong>{cell.date.toLocaleDateString('fa-IR', { day: 'numeric' })}</strong>
               {cell.shifts.slice(0, 3).map(shift => <span className={'calendar-shift '+shift.shift_type} key={shift.id} title={colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند'}>{(colleagues.find(person => person.id === shift.employee_id)?.display_name || 'کارمند').split(' ')[0]} · {shiftTypeLabel(shift.shift_type)}</span>)}
               {cell.shifts.length > 3 && <small>+{cell.shifts.length - 3} شیفت دیگر</small>}
             </div> : <div className="shift-calendar-day blank" key={'blank-'+index} />)}</div>
             <p className="calendar-export-note">فایل خروجی شامل شیفت‌های همین ماه است و با Excel قابل بازکردن است.</p>
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
