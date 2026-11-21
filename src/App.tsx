import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeftRight, Bell, Building2, CalendarDays, ChevronLeft, ClipboardList, HeartHandshake, Home, LogIn, LogOut, Menu, Search, ShieldCheck, UserRound, Users, X, Megaphone } from 'lucide-react'
import { supabase } from './lib/supabase'

type Page = 'خانه' | 'همکاران' | 'درخواست تبادل' | 'درخواست‌های من' | 'پروفایل' | 'مدیریت درخواست‌ها' | 'اطلاعیه‌ها' | 'پیام‌ها'
type Profile = { id: string; display_name: string; department: string | null; job_title: string | null; role?: string }
type ExchangeRequest = { id: string; employee_id?: string; request_type: string; from_unit: string; to_unit: string; note: string | null; status: string; created_at: string }
type Announcement = { id: string; title: string; body: string; priority: 'normal' | 'important'; is_published: boolean; created_at: string; published_at: string | null }
type DirectMessage = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }

const units = ['اورژانس', 'داخلی', 'جراحی', 'ICU', 'آزمایشگاه', 'رادیولوژی', 'داروخانه', 'پذیرش', 'سایر']
const nav: { label: Page; icon: typeof Home }[] = [
  { label: 'خانه', icon: Home }, { label: 'همکاران', icon: Users },
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
  const [selectedContact, setSelectedContact] = useState<Profile | null>(null)
  const [threadMessages, setThreadMessages] = useState<DirectMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
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

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      setUserEmail(data.session?.user.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      if (!session) { setProfile(null); setRequests([]) }
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
        client.from('employee_profiles').select('id,display_name,department,job_title,role').eq('id', userId).maybeSingle(),
        client.from('employee_profiles').select('id,display_name,department,job_title').eq('is_active', true).order('display_name'),
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
  }, [userEmail])

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
    else { setPage('خانه'); setMessage('از حساب کاربری خارج شدید.') }
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

  const loadThread = async (contact: Profile) => {
    if (!supabase || !profile) return
    setSelectedContact(contact); setError('')
    const { data, error: loadError } = await supabase.from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${contact.id}),and(sender_id.eq.${contact.id},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true })
    if (loadError) { setError('بارگذاری گفت‌وگو انجام نشد.'); return }
    setThreadMessages(data ?? [])
    const unreadIds = (data ?? []).filter(m => m.recipient_id === profile.id && !m.read_at).map(m => m.id)
    if (unreadIds.length) {
      const { error: readError } = await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      if (readError) setError('پیام‌ها نمایش داده شدند اما وضعیت خوانده‌شدن ثبت نشد.')
      else {
        const now = new Date().toISOString()
        setThreadMessages(current => current.map(m => unreadIds.includes(m.id) ? { ...m, read_at: now } : m))
        setUnreadCount(current => Math.max(0, current - unreadIds.length))
      }
    }
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
        {[...nav, ...(isAdmin ? [{ label: 'مدیریت درخواست‌ها' as Page, icon: ShieldCheck }] : [])].map(({ label, icon: Icon }) => <button key={label} className={page === label ? 'nav-item active' : 'nav-item'} onClick={() => go(label)}><Icon size={18} /><span>{label}</span>{page === label && <ChevronLeft size={16} className="nav-arrow" />}</button>)}
        <div className="side-card"><div className="side-card-icon"><HeartHandshake size={20} /></div><strong>همراه یکدیگر</strong><p>برای ساخت محیط کاری بهتر، ارتباط و همکاری را آسان‌تر کنیم.</p></div>
        <div className="side-footer"><ShieldCheck size={15} /> فضای اختصاصی کارکنان</div>
      </aside>
      <main className="main-content">
        <div className="welcome-row"><div><div className="eyebrow">بیمارستان مدنی · سامانه کارکنان</div><h1>{page === 'خانه' ? 'به شهروند مدنی خوش آمدید' : page}</h1><p>{page === 'خانه' ? 'ارتباط، همکاری و همراهی همکاران در یک فضای مشترک.' : 'ابزارهای ارتباط و همکاری کارکنان بیمارستان مدنی.'}</p></div><div className="date-chip"><CalendarDays size={17} /> فضای همکاری کارکنان</div></div>
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
            <aside className="contact-list"><strong>انتخاب همکار</strong>{colleagues.filter(c => c.id !== profile?.id).map(c => <button key={c.id} className={selectedContact?.id === c.id ? 'contact-button selected' : 'contact-button'} onClick={() => loadThread(c)}><span className="avatar">{c.display_name?.slice(0,1) || 'ک'}</span><span><b>{c.display_name}</b><small>{c.department || c.job_title || 'کارمند'}</small></span></button>)}</aside>
            <div className="chat-panel">
              {selectedContact ? <><div className="chat-heading"><strong>{selectedContact.display_name}</strong><small>{selectedContact.department || 'همکار بیمارستان مدنی'}</small></div>
                <div className="chat-messages">{threadMessages.length ? threadMessages.map(m => <div key={m.id} className={m.sender_id === profile?.id ? 'chat-bubble mine' : 'chat-bubble'}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString('fa-IR')}</small></div>) : <div className="empty-chat">هنوز پیامی در این گفت‌وگو وجود ندارد.</div>}</div>
                <form className="chat-compose" onSubmit={sendDirectMessage}><textarea value={messageDraft} onChange={e => setMessageDraft(e.target.value)} maxLength={4000} rows={2} placeholder="پیام خود را بنویسید..." /><button className="primary-btn" disabled={busy || !messageDraft.trim()}>{busy ? 'در حال ارسال...' : 'ارسال پیام'}</button></form>
              </> : <div className="empty-state"><Users size={34}/><strong>یک همکار را انتخاب کنید</strong><span>برای شروع گفت‌وگوی خصوصی، نام همکار را از فهرست انتخاب کنید.</span></div>}
            </div>
          </div>}
        </section>}
        {page === 'مدیریت درخواست‌ها' && <section className="panel"><div className="panel-title"><div><h2>مدیریت درخواست‌های تبادل</h2><p>بررسی و تعیین نتیجه درخواست‌های کارکنان</p></div><span className="count-pill">{requests.filter(r => r.status === 'pending').length} در انتظار</span></div>{!isAdmin ? <LoginPrompt onLogin={() => setShowLogin(true)} /> : requests.length === 0 ? <div className="empty-state"><ClipboardList size={36}/><strong>درخواستی برای بررسی وجود ندارد</strong></div> : <div className="request-list">{requests.map(r => <div className="request-row" key={r.id}><div className="request-symbol"><ArrowLeftRight/></div><div className="request-info"><strong>{r.request_type} · {employeeNames[r.employee_id || ''] || 'کارمند'}</strong><span>{r.from_unit} ← {r.to_unit}</span>{r.note && <small>{r.note}</small>}<small>{new Date(r.created_at).toLocaleDateString('fa-IR')}</small></div><span className={r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : 'status-pending'}>{statusLabel(r.status)}</span>{r.status === 'pending' && <div className="review-actions"><button className="approve-btn" disabled={busy} onClick={() => reviewRequest(r.id, 'approved')}>تأیید</button><button className="reject-btn" disabled={busy} onClick={() => reviewRequest(r.id, 'rejected')}>رد</button></div>}</div>)}</div>}</section>}
        {page === 'پروفایل' && <section className="panel profile-panel"><div className="profile-avatar"><UserRound size={34} /></div><h2>{profile?.display_name || 'پروفایل کارمند'}</h2><p>{profile ? [profile.job_title, profile.department].filter(Boolean).join(' · ') : userEmail || 'برای مشاهده اطلاعات پروفایل وارد سامانه شوید.'}</p>{userEmail ? <button className="primary-btn" onClick={logout}><LogOut size={16} /> خروج از حساب</button> : <button className="primary-btn" onClick={() => setShowLogin(true)}>ورود کارکنان</button>}</section>}
        <footer className="footer">شهروند مدنی <span>·</span> سامانه جامعه دیجیتال کارکنان بیمارستان مدنی</footer>
      </main>
    </div>
    {showLogin && <div className="modal-backdrop" onClick={() => setShowLogin(false)}><form className="login-modal" onSubmit={login} onClick={e => e.stopPropagation()}><button type="button" className="close-btn" onClick={() => setShowLogin(false)}><X /></button><div className="modal-icon"><ShieldCheck /></div><h2>ورود کارکنان</h2><p>ورود امن با حساب کاربری سازمانی</p><label htmlFor="login-email">ایمیل سازمانی</label><input id="login-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@hospital.ir" /><label htmlFor="login-password">رمز عبور</label><input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور" /><button className="primary-btn full" disabled={busy || !configured}>{busy ? 'در حال بررسی...' : 'ورود به سامانه'}</button><small>ساخت و تأیید حساب کارکنان باید توسط مسئول سامانه انجام شود.</small></form></div>}
  </div>
}

function statusLabel(status: string) { return status === 'approved' ? 'تأیید شده' : status === 'rejected' ? 'رد شده' : 'در انتظار بررسی' }
function LoginPrompt({ onLogin }: { onLogin: () => void }) { return <div className="empty-state"><ShieldCheck size={34} /><strong>ورود به سامانه الزامی است</strong><span>برای مشاهده اطلاعات کارکنان یا ثبت درخواست وارد حساب خود شوید.</span><button className="primary-btn" onClick={onLogin}>ورود کارکنان</button></div> }
function Stat({ icon: Icon, value, label, hint }: any) { return <div className="stat-card"><div className="stat-icon"><Icon size={20} /></div><div><strong>{value}</strong><span>{label}</span><small>{hint}</small></div></div> }
function Quick({ icon: Icon, title, text, onClick }: any) { return <button className="quick-card" onClick={onClick}><div className="quick-icon"><Icon size={22} /></div><div><strong>{title}</strong><span>{text}</span></div><ChevronLeft size={18} className="quick-arrow" /></button> }
export default App
