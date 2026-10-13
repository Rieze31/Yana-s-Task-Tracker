import { useEffect, useMemo, useState } from 'react'
import { supabase, configured } from './supabase'
import { exportExcel } from './exportExcel'
import { ORDER, LABEL, COLOR, MONTHS, today, shiftDate, shiftMonth, monthEnd, fmtLong, fmtMonth, fmtShort, fmtTime, monthKey, countBy } from './lib'

const toPatch = (kind, v, period) =>
  kind === 'daily'
    ? { title: v.title, status: v.status, task_date: v.date || period, due_time: v.time || null, notes: v.notes || null }
    : { title: v.title, status: v.status, due_date: v.date || null, notes: v.notes || null }

/* ---------- charts ---------- */
function Donut({ c, size = 96 }) {
  const total = c.todo + c.doing + c.done, r = 40, C = 2 * Math.PI * r
  let off = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#2a3040" strokeWidth="14" />
        {total > 0 && ORDER.map((s) => {
          const len = (c[s] / total) * C
          const el = <circle key={s} cx="50" cy="50" r={r} fill="none" stroke={COLOR[s]} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />
          off += len
          return el
        })}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold">{total ? Math.round((c.done / total) * 100) : 0}%</span>
    </div>
  )
}
const Dot = ({ s }) => <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s] }} />

/* ---------- monthly report ---------- */
function Report({ tasks, year, setYear, openMonth }) {
  const data = MONTHS.map((m, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    return { m, key, c: countBy(tasks.filter((t) => monthKey(t) === key)) }
  })
  const all = countBy(tasks.filter((t) => monthKey(t)?.startsWith(year)))
  const total = all.todo + all.doing + all.done
  const max = Math.max(1, ...data.map((d) => d.c.todo + d.c.doing + d.c.done))
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => setYear(String(+year - 1))} aria-label="Previous year">‹</button>
        <h2 className="text-xl font-bold">{year} report</h2>
        <button className="btn-ghost" onClick={() => setYear(String(+year + 1))} aria-label="Next year">›</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card flex items-center gap-5 p-5">
          <Donut c={all} size={120} />
          <ul className="space-y-1.5 text-sm">
            {ORDER.map((s) => <li key={s} className="flex items-center gap-2"><Dot s={s} />{LABEL[s]}<b className="ml-auto pl-4">{all[s]}</b></li>)}
            <li className="border-t border-line pt-1.5 text-slate-400">{total} tasks in {year}</li>
          </ul>
        </div>
        <div className="card p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-slate-300">Tasks per month</p>
          <div className="flex h-36 items-end gap-1.5 sm:gap-2">
            {data.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col justify-end text-center">
                <div className="flex flex-col-reverse overflow-hidden rounded-t" title={`${d.m}: ${d.c.todo} to do, ${d.c.doing} doing, ${d.c.done} done`}>
                  {ORDER.map((s) => <div key={s} style={{ height: `${(d.c[s] / max) * 120}px`, background: COLOR[s] }} />)}
                </div>
                <span className="mt-1 text-[10px] text-slate-400 sm:text-xs">{d.m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.map((d) => {
          const n = d.c.todo + d.c.doing + d.c.done
          return (
            <button key={d.key} onClick={() => openMonth(d.key)} className="card flex items-center gap-4 p-4 text-left transition hover:border-accent">
              <Donut c={d.c} size={72} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="mb-1 font-bold">{fmtMonth(d.key)}</p>
                {n === 0 ? <p className="text-slate-500">No tasks</p> : ORDER.map((s) => (
                  <p key={s} className="flex items-center gap-2 text-slate-300"><Dot s={s} />{LABEL[s]}<b className="ml-auto">{d.c[s]}</b></p>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- add / edit form ---------- */
function TaskForm({ kind, period, task, onSave, onCancel }) {
  const editing = Boolean(task)
  const [title, setTitle] = useState(task?.title ?? '')
  const [status, setStatus] = useState(task?.status ?? 'todo')
  const [time, setTime] = useState(task?.due_time?.slice(0, 5) ?? '')
  const [date, setDate] = useState(kind === 'daily' ? task?.task_date ?? period : task?.due_date ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [showNotes, setShowNotes] = useState(Boolean(task?.notes))
  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), status, time, date, notes: notes.trim() })
    if (!editing) { setTitle(''); setTime(''); setDate(''); setNotes(''); setShowNotes(false) }
  }
  const lab = 'flex flex-col gap-1 text-xs text-slate-400'
  return (
    <form onSubmit={submit} className={editing ? 'w-full' : 'card p-3 sm:p-4'}>
      <input className="field !bg-ink text-base" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={editing} aria-label="Task title"
        placeholder={kind === 'daily' ? 'What do you need to do today?' : 'What do you want to get done this month?'} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {kind === 'daily' && editing && <label className={lab}>Date<input className="field !w-auto !py-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>}
        {kind === 'daily' && <label className={lab}>Time<input className="field !w-auto !py-1.5" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>}
        {kind === 'monthly' && <label className={lab}>Date<input className="field !w-auto !py-1.5" type="date" value={date} min={period + '-01'} max={monthEnd(period)} onChange={(e) => setDate(e.target.value)} /></label>}
        {editing && <label className={lab}>Status<select className="field !w-auto !py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>{ORDER.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label>}
        {!showNotes && <button type="button" className="pb-2 text-sm font-semibold text-accent" onClick={() => setShowNotes(true)}>+ Add notes</button>}
        <span className="flex-1" />
        {editing && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-primary">{editing ? 'Save changes' : 'Add task'}</button>
      </div>
      {showNotes && <textarea className="field mt-3" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" />}
    </form>
  )
}

/* ---------- task (list row or board card) ---------- */
function TaskItem({ task, kind, period, board, showDate, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const done = task.status === 'done'
  const when = kind === 'daily' ? task.task_date : task.due_date
  const overdue = !done && when && when < today()
  const next = ORDER[(ORDER.indexOf(task.status) + 1) % 3]
  const meta = [
    kind === 'daily' && showDate && fmtShort(task.task_date),
    kind === 'daily' && task.due_time && fmtTime(task.due_time),
    kind === 'monthly' && showDate && fmtMonth(task.task_month),
    kind === 'monthly' && task.due_date && fmtShort(task.due_date),
  ].filter(Boolean)

  if (editing) {
    return (
      <li className="card p-3">
        <TaskForm kind={kind} period={period} task={task} onCancel={() => setEditing(false)}
          onSave={(v) => { onUpdate(task.id, toPatch(kind, v, period)); setEditing(false) }} />
      </li>
    )
  }
  const actions = (
    <>
      <button className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-raised hover:text-white" onClick={() => setEditing(true)}>Edit</button>
      <button className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-raised hover:text-red-400" onClick={() => window.confirm('Delete this task?') && onRemove(task.id)}>Delete</button>
    </>
  )
  const info = (
    <div className="min-w-0 flex-1">
      <p className={`break-words font-semibold ${done ? 'text-slate-500 line-through' : ''}`}>{task.title}</p>
      {(meta.length > 0 || overdue) && (
        <p className="flex gap-3 text-xs text-slate-400">{meta.map((m) => <span key={m}>{m}</span>)}{overdue && <span className="font-semibold text-red-400">Overdue</span>}</p>
      )}
      {task.notes && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-400">{task.notes}</p>}
    </div>
  )

  if (board) {
    return (
      <li draggable onDragStart={(e) => e.dataTransfer.setData('id', task.id)} className="card cursor-grab p-3 active:cursor-grabbing">
        <div className="flex items-start gap-2">{info}<div className="-mr-1 -mt-1 flex shrink-0">{actions}</div></div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {ORDER.map((s) => (
            <button key={s} onClick={() => onUpdate(task.id, { status: s })} aria-pressed={task.status === s}
              className="rounded-md border py-1 text-xs font-semibold transition"
              style={task.status === s ? { background: COLOR[s], borderColor: COLOR[s], color: '#0f1218' } : { borderColor: '#2a3040', color: '#8b93a5' }}>
              {LABEL[s]}
            </button>
          ))}
        </div>
      </li>
    )
  }
  return (
    <li className={`card flex flex-wrap items-start gap-x-3 gap-y-2 py-3 pl-3 pr-2 sm:flex-nowrap ${done ? 'opacity-80' : ''}`}>
      <button aria-label={done ? 'Mark as to do' : 'Mark as done'} onClick={() => onUpdate(task.id, { status: done ? 'todo' : 'done' })}
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 text-sm font-extrabold text-black ${done ? 'border-emerald-400 bg-emerald-400' : 'border-line hover:border-emerald-400'}`}>{done ? '✓' : ''}</button>
      {info}
      <button title={`Change to ${LABEL[next]}`} onClick={() => onUpdate(task.id, { status: next })}
        className="shrink-0 rounded-full border px-3 py-0.5 text-xs font-semibold" style={{ color: COLOR[task.status], borderColor: COLOR[task.status] }}>{LABEL[task.status]}</button>
      <div className="flex shrink-0">{actions}</div>
    </li>
  )
}

/* ---------- app ---------- */
export default function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('daily')
  const [layout, setLayout] = useState('list')
  const [day, setDay] = useState(today())
  const [month, setMonth] = useState(today().slice(0, 7))
  const [year, setYear] = useState(today().slice(0, 4))
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!configured) return setLoading(false)
    const { data, error } = await supabase.from('tasks').select('*').order('created_at')
    if (error) setError('Could not load tasks. Check your Supabase URL, key and that you ran supabase.sql.')
    else { setTasks(data); setError('') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const add = async (row) => {
    const { data, error } = await supabase.from('tasks').insert(row).select().single()
    if (error) return setError('Could not add the task. Please try again.')
    setTasks((t) => [...t, data])
  }
  const update = async (id, patch) => {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    if (error) { setError('Could not save that change. Reloading your tasks.'); load() }
  }
  const remove = async (id) => {
    setTasks((t) => t.filter((x) => x.id !== id))
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { setError('Could not delete the task. Reloading your tasks.'); load() }
  }
  const download = async () => {
    setBusy(true)
    try { await exportExcel(tasks, year) } catch { setError('Could not create the Excel file.') }
    setBusy(false)
  }

  const kind = view === 'monthly' ? 'monthly' : 'daily'
  const period = kind === 'daily' ? day : month
  const searching = q.trim() !== ''

  const inPeriod = useMemo(() => tasks.filter((t) => t.type === kind && (kind === 'daily' ? t.task_date === day : t.task_month === month)), [tasks, kind, day, month])
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = searching ? tasks.filter((t) => t.type === kind) : inPeriod // searching looks across all dates
    return pool
      .filter((t) => !needle || t.title.toLowerCase().includes(needle) || (t.notes || '').toLowerCase().includes(needle))
      .filter((t) => !overdueOnly || (t.status !== 'done' && (kind === 'daily' ? t.task_date : t.due_date) < today() && (kind === 'daily' ? t.task_date : t.due_date)))
      .sort((a, b) => {
        const k = (t) => (kind === 'daily' ? (searching ? t.task_date : '') + (t.due_time || '~') : (searching ? t.task_month : '') + (t.due_date || '~'))
        return k(a).localeCompare(k(b))
      })
  }, [tasks, inPeriod, kind, q, searching, overdueOnly])

  const counts = countBy(base)
  const shown = filter === 'all' ? base : base.filter((t) => t.status === filter)
  const periodCounts = countBy(inPeriod)
  const pct = inPeriod.length ? Math.round((periodCounts.done / inPeriod.length) * 100) : 0
  const cols = filter === 'all' ? ORDER : [filter]

  const addTask = (v) => {
    const base = toPatch(kind, v, period)
    add(kind === 'daily' ? { type: 'daily', ...base } : { type: 'monthly', task_month: month, ...base })
  }
  const nav = (n) => (kind === 'daily' ? setDay(shiftDate(day, n)) : setMonth(shiftMonth(month, n)))
  const itemProps = { kind, period, showDate: searching, onUpdate: update, onRemove: remove }

  if (!configured) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <h1 className="text-3xl font-bold">Almost there</h1>
        <p className="mt-2 text-slate-400">Add your Supabase details to a <code>.env</code> file, then restart the app:</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface p-4 text-sm">{'VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY'}</pre>
      </main>
    )
  }

  const tab = (on) => `border-b-2 px-1 pb-3 pt-2 text-sm font-semibold transition ${on ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-white'}`
  return (
    <main className={`mx-auto px-4 pb-20 pt-6 sm:px-6 sm:pt-8 ${layout === 'board' || view === 'report' ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Baby Yana's tasks</h1>
        <button className="btn-ghost" onClick={download} disabled={!tasks.length || busy}>{busy ? 'Preparing…' : 'Download Excel'}</button>
      </header>

      <nav className="mb-6 flex gap-6 border-b border-line" role="tablist">
        {[['daily', 'Daily'], ['monthly', 'Monthly'], ['report', 'Report']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={tab(view === v)} onClick={() => { setView(v); setFilter('all'); setQ('') }}>{l}</button>
        ))}
      </nav>

      {view === 'report' ? (
        <Report tasks={tasks} year={year} setYear={setYear} openMonth={(key) => { setMonth(key); setYear(key.slice(0, 4)); setView('monthly') }} />
      ) : (
        <>
          <section className="mb-4 flex flex-wrap items-center gap-2">
            <button className="btn-ghost !px-3 text-lg" aria-label="Previous" onClick={() => nav(-1)}>‹</button>
            <div className="min-w-0 flex-1 basis-48">
              <h2 className="text-lg font-bold sm:text-xl">{kind === 'daily' ? fmtLong(day) : fmtMonth(month)}</h2>
            </div>
            {kind === 'daily'
              ? <input className="field !w-auto" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pick a date" />
              : <input className="field !w-auto" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Pick a month" />}
            <button className="btn-ghost !px-3 text-lg" aria-label="Next" onClick={() => nav(1)}>›</button>
            <button className="btn-ghost" onClick={() => { setDay(today()); setMonth(today().slice(0, 7)) }}>{kind === 'daily' ? 'Today' : 'This month'}</button>
          </section>

          <TaskForm key={view + period} kind={kind} period={period} onSave={addTask} />
          {error && <div role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/60 px-4 py-2.5 text-sm text-red-300">{error}</div>}

          <div className="mb-4 mt-5 flex items-center gap-3 text-sm text-slate-400">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full bg-emerald-400 transition-all" style={{ width: pct + '%' }} /></div>
            {inPeriod.length > 0 && <span>{periodCounts.done} of {inPeriod.length} done</span>}
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input className="field sm:max-w-xs" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search all ${kind} tasks`} aria-label="Search tasks" />
            <label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-amber-400" />Overdue only</label>
            <div className="flex overflow-hidden rounded-lg border border-line text-sm font-semibold sm:ml-auto">
              {['list', 'board'].map((l) => <button key={l} onClick={() => setLayout(l)} className={`px-4 py-1.5 capitalize ${layout === l ? 'bg-raised text-white' : 'text-slate-400'}`}>{l}</button>)}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {['all', ...ORDER].map((s) => (
              <button key={s} role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1 text-sm font-semibold transition ${filter === s ? 'border-accent bg-accent/10 text-white' : 'border-line text-slate-400 hover:text-white'}`}>
                {s !== 'all' && <Dot s={s} />}{s === 'all' ? 'All' : LABEL[s]}
                <span className="text-xs text-slate-500">{s === 'all' ? base.length : counts[s]}</span>
              </button>
            ))}
          </div>
          {searching && <p className="mb-3 text-sm text-slate-400">Showing matches from every {kind === 'daily' ? 'day' : 'month'}.</p>}

          {loading ? <p className="text-slate-400">Loading…</p> : layout === 'list' ? (
            shown.length === 0 ? <Empty searching={searching} kind={kind} /> :
              <ul className="space-y-2">{shown.map((t) => <TaskItem key={t.id} task={t} {...itemProps} />)}</ul>
          ) : (
            <div className={`grid gap-4 ${cols.length === 3 ? 'md:grid-cols-3' : 'grid-cols-1'}`}>
              {cols.map((s) => {
                const items = base.filter((t) => t.status === s)
                return (
                  <section key={s} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('id'); if (id) update(id, { status: s }) }}
                    className="min-h-40 rounded-xl border border-line bg-ink/60 p-3">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Dot s={s} />{LABEL[s]}<span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs text-slate-400">{items.length}</span></h3>
                    <ul className="space-y-2">{items.map((t) => <TaskItem key={t.id} task={t} board {...itemProps} />)}</ul>
                    {items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Drop a task here</p>}
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
       <footer className="mt-12 border-t border-line pt-6 text-center text-sm text-slate-500">

        <p className="mt-1">© {new Date().getFullYear()} Made by Your Baby Riz</p>
      </footer>
    </main>
  )
}

const Empty = ({ searching, kind }) => (
  <p className="py-12 text-center text-slate-400">
    {searching ? 'No tasks match your search.' : kind === 'daily' ? 'No tasks here yet. Add your first task above.' : 'No goals here yet. Add one above.'}
  </p>
)
