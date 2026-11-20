import { useMemo, useState } from 'react'
import { Activity, ArrowLeftRight, Bell, Building2, CalendarDays, CheckCircle2, ChevronLeft, ClipboardList, HeartHandshake, Home, LogIn, Menu, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react'

type Page = 'خانه' | 'همکاران' | 'درخواست تبادل' | 'درخواست‌های من' | 'پروفایل'
const colleagues = [
  { name: 'دکتر سارا احمدی', role: 'پزشک متخصص', unit: 'داخلی', status: 'آنلاین' },
  { name: 'علی رضایی', role: 'پرستار', unit: 'اورژانس', status: 'در دسترس' },
  { name: 'مریم کریمی', role: 'کارشناس آزمایشگاه', unit: 'آزمایشگاه', status: 'آنلاین' },
  { name: 'محمد موسوی', role: 'پرستار', unit: 'ICU', status: 'در دسترس' },
]
function App() {
  const [page, setPage] = useState<Page>('خانه')
  const [mobileNav, setMobileNav] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [query, setQuery] = useState('')
  const [requests, setRequests] = useState<{kind:string,from:string,to:string,note:string,status:string}[]>([])
  const [kind, setKind] = useState('تبادل بخش')
  const [from, setFrom] = useState('اورژانس')
  const [to, setTo] = useState('داخلی')
  const [note, setNote] = useState('')
  const filtered = useMemo(() => colleagues.filter(c => (c.name+c.role+c.unit).includes(query)), [query])
  const nav: {label:Page, icon:any}[] = [
    {label:'خانه',icon:Home},{label:'همکاران',icon:Users},{label:'درخواست تبادل',icon:ArrowLeftRight},{label:'درخواست‌های من',icon:ClipboardList},{label:'پروفایل',icon:UserRound}
  ]
  const submit = (e:React.FormEvent) => {
    e.preventDefault()
    setRequests([{kind,from,to,note,status:'در انتظار بررسی'},...requests])
    setPage('درخواست‌های من')
    setNote('')
  }
  return <div className="app-shell">
    <header className="topbar">
      <button className="mobile-menu icon-btn" onClick={()=>setMobileNav(!mobileNav)} aria-label="منو"><Menu/></button>
      <div className="brand-mark"><Building2 size={23}/></div>
      <div className="brand"><strong>شهروند مدنی</strong><span>جامعه دیجیتال کارکنان بیمارستان مدنی</span></div>
      <div className="top-actions"><button className="icon-btn notification" aria-label="اعلان‌ها"><Bell size={19}/><i/></button><button className="login-btn" onClick={()=>setShowLogin(true)}><LogIn size={17}/> ورود کارکنان</button></div>
    </header>
    <div className="layout">
      <aside className={mobileNav?'sidebar open':'sidebar'}>
        <div className="side-caption">فضای کاری</div>
        {nav.map(({label,icon:Icon})=><button key={label} className={page===label?'nav-item active':'nav-item'} onClick={()=>{setPage(label);setMobileNav(false)}}><Icon size={18}/><span>{label}</span>{page===label&&<ChevronLeft size={16} className="nav-arrow"/>}</button>)}
        <div className="side-card"><div className="side-card-icon"><HeartHandshake size={20}/></div><strong>همراه یکدیگر</strong><p>برای ساخت محیط کاری بهتر، ارتباط و همکاری را آسان‌تر کنیم.</p></div>
        <div className="side-footer"><ShieldCheck size={15}/> فضای اختصاصی کارکنان</div>
      </aside>
      <main className="main-content">
        <div className="welcome-row"><div><div className="eyebrow">بیمارستان مدنی · سامانه کارکنان</div><h1>{page==='خانه'?'به شهروند مدنی خوش آمدید':page}</h1><p>{page==='خانه'?'ارتباط، همکاری و همراهی همکاران در یک فضای مشترک.':'ابزارهای ارتباط و همکاری کارکنان بیمارستان مدنی.'}</p></div><div className="date-chip"><CalendarDays size={17}/> امروز، روزی برای همکاری</div></div>
        {page==='خانه'&&<>
          <section className="hero-card"><div className="hero-content"><span className="hero-tag">کنار هم، قوی‌تر</span><h2>یک جامعه؛ هزاران فرصت همکاری</h2><p>با همکاران خود ارتباط بگیرید، درخواست‌های همکاری ثبت کنید و از تازه‌ترین اطلاعیه‌ها باخبر شوید.</p><button onClick={()=>setPage('همکاران')} className="hero-btn">مشاهده همکاران <ChevronLeft size={17}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-building"><Building2 size={74}/><span>مدنی</span></div><div className="float-bubble bubble-a"><Users size={21}/></div><div className="float-bubble bubble-b"><HeartHandshake size={21}/></div></div></section>
          <section className="stats-grid"><Stat icon={Users} value="—" label="اعضای جامعه" hint="پس از اتصال سامانه نمایش داده می‌شود"/><Stat icon={ArrowLeftRight} value={String(requests.length)} label="درخواست‌های ثبت‌شده" hint="در این نشست"/><Stat icon={Activity} value="فعال" label="وضعیت سامانه" hint="نسخه اولیه نمایشی"/></section>
          <div className="section-heading"><div><h2>دسترسی سریع</h2><p>از بخش موردنظر خود شروع کنید.</p></div></div>
          <section className="quick-grid"><Quick icon={Users} title="فهرست همکاران" text="جست‌وجو و مشاهده همکاران" onClick={()=>setPage('همکاران')}/><Quick icon={ArrowLeftRight} title="تبادل بخش یا بیمارستان" text="ثبت درخواست جابه‌جایی سازمانی" onClick={()=>setPage('درخواست تبادل')}/><Quick icon={ClipboardList} title="پیگیری درخواست‌ها" text="مشاهده وضعیت درخواست‌های خود" onClick={()=>setPage('درخواست‌های من')}/></section>
          <section className="notice"><div className="notice-icon"><Bell size={20}/></div><div><strong>اطلاعیه سامانه</strong><p>این نسخه، نمونه اولیه رابط کاربری است. برای فعال‌شدن اطلاعات واقعی، احراز هویت و پایگاه داده باید متصل شوند.</p></div></section>
        </>}
        {page==='همکاران'&&<section className="panel"><div className="panel-title"><div><h2>فهرست همکاران</h2><p>همکاران جامعه بیمارستان مدنی</p></div><span className="count-pill">{filtered.length} نفر</span></div><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجوی نام، سمت یا بخش..."/></div><div className="people-list">{filtered.map((c,i)=><div className="person-row" key={c.name}><div className="avatar">{c.name.slice(0,1)}</div><div className="person-info"><strong>{c.name}</strong><span>{c.role} · بخش {c.unit}</span></div><span className="online-dot">{c.status}</span><button className="small-outline">مشاهده</button></div>)}</div><p className="demo-note">اطلاعات بالا نمونه نمایشی است و هنوز از فهرست واقعی کارکنان دریافت نمی‌شود.</p></section>}
        {page==='درخواست تبادل'&&<section className="panel form-panel"><div className="panel-title"><div><h2>درخواست تبادل بخش یا بیمارستان</h2><p>اطلاعات درخواست خود را وارد کنید تا برای بررسی ثبت شود.</p></div><div className="form-icon"><ArrowLeftRight/></div></div><form onSubmit={submit}><label>نوع درخواست</label><div className="choice-row"><button type="button" className={kind==='تبادل بخش'?'choice selected':'choice'} onClick={()=>setKind('تبادل بخش')}>تبادل بخش</button><button type="button" className={kind==='تبادل بیمارستان'?'choice selected':'choice'} onClick={()=>setKind('تبادل بیمارستان')}>تبادل بیمارستان</button></div><div className="field-grid"><div><label htmlFor="from">بخش / محل فعلی</label><select id="from" value={from} onChange={e=>setFrom(e.target.value)}><option>اورژانس</option><option>داخلی</option><option>جراحی</option><option>ICU</option><option>آزمایشگاه</option><option>رادیولوژی</option></select></div><div><label htmlFor="to">بخش / محل موردنظر</label><select id="to" value={to} onChange={e=>setTo(e.target.value)}><option>داخلی</option><option>اورژانس</option><option>جراحی</option><option>ICU</option><option>آزمایشگاه</option><option>رادیولوژی</option></select></div></div><label htmlFor="note">توضیحات و دلیل درخواست</label><textarea id="note" value={note} onChange={e=>setNote(e.target.value)} placeholder="در صورت نیاز توضیحات تکمیلی را بنویسید..." rows={4}/><div className="form-actions"><span>ثبت نهایی در این نسخه به‌صورت آزمایشی انجام می‌شود.</span><button className="primary-btn" type="submit">ثبت درخواست <ChevronLeft size={17}/></button></div></form></section>}
        {page==='درخواست‌های من'&&<section className="panel"><div className="panel-title"><div><h2>درخواست‌های من</h2><p>پیگیری درخواست‌های ثبت‌شده</p></div><button className="primary-btn" onClick={()=>setPage('درخواست تبادل')}>درخواست جدید</button></div>{requests.length===0?<div className="empty-state"><ClipboardList size={36}/><strong>هنوز درخواستی ثبت نکرده‌اید</strong><span>درخواست تبادل بخش یا بیمارستان خود را ثبت کنید.</span><button className="primary-btn" onClick={()=>setPage('درخواست تبادل')}>ثبت درخواست</button></div>:<div className="request-list">{requests.map((r,i)=><div className="request-row" key={i}><div className="request-symbol"><ArrowLeftRight/></div><div className="request-info"><strong>{r.kind}</strong><span>{r.from} ← {r.to}</span>{r.note&&<small>{r.note}</small>}</div><span className="status-pending">{r.status}</span></div>)}</div>}</section>}
        {page==='پروفایل'&&<section className="panel profile-panel"><div className="profile-avatar"><UserRound size={34}/></div><h2>پروفایل کارمند</h2><p>برای مشاهده و ویرایش اطلاعات شخصی، ابتدا وارد سامانه شوید.</p><button className="primary-btn" onClick={()=>setShowLogin(true)}>ورود کارکنان</button></section>}
        <footer className="footer">شهروند مدنی <span>·</span> نسخه اولیه سامانه جامعه دیجیتال کارکنان</footer>
      </main>
    </div>
    {showLogin&&<div className="modal-backdrop" onClick={()=>setShowLogin(false)}><div className="login-modal" onClick={e=>e.stopPropagation()}><button className="close-btn" onClick={()=>setShowLogin(false)}><X/></button><div className="modal-icon"><ShieldCheck/></div><h2>ورود کارکنان</h2><p>ورود امن به فضای اختصاصی کارکنان بیمارستان مدنی</p><label>نام کاربری</label><input placeholder="نام کاربری سازمانی"/><label>رمز عبور</label><input type="password" placeholder="رمز عبور"/><button className="primary-btn full" onClick={()=>setShowLogin(false)}>ورود به سامانه</button><small>احراز هویت در نسخه آزمایشی هنوز فعال نشده است.</small></div></div>}
  </div>
}
function Stat({icon:Icon,value,label,hint}:any){return <div className="stat-card"><div className="stat-icon"><Icon size={20}/></div><div><strong>{value}</strong><span>{label}</span><small>{hint}</small></div></div>}
function Quick({icon:Icon,title,text,onClick}:any){return <button className="quick-card" onClick={onClick}><div className="quick-icon"><Icon size={22}/></div><div><strong>{title}</strong><span>{text}</span></div><ChevronLeft size={18} className="quick-arrow"/></button>}
export default App