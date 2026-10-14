import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, configured } from './supabase'
import { exportExcel } from './exportExcel'
import { VERSES, QUOTES } from './content'
import {
  ORDER, LABEL, RANK,
  today, shiftDate, shiftMonth,
  fmtLong, fmtMonth, fmtShort, fmtTime,
  countBy, fmtDeadline, splitDeadline, joinDeadline, isOverdue, ding,
  packMetadata, unpackMetadata,
} from './lib'

const TITLE = "Baby Yana's Task Tracker"

/* Palette taken from the PLM Student Commission on Audit seal:
   deep green, cream, antique gold, silver. */
const STATUS_HEX = ['#c4c4c4', '#c9b458', '#ededed'] // order: first, middle, last status
const sc = (s) => STATUS_HEX[Math.max(0, ORDER.indexOf(s))]
const DANGER = '#e0806f'

/* Red border for High priority (inline style so it always wins over .card CSS) */
const RED = '#ef4444'
const redBorder = (t) =>
  t.priority === 'high' && t.status !== 'done' ? { borderColor: RED, borderWidth: 2 } : undefined

const PRI = {
  high: { label: 'High priority', short: 'High', cls: 'border-danger text-danger bg-danger/10' },
  medium: { label: 'Medium priority', short: 'Medium', cls: 'border-gold text-gold bg-gold/10' },
  low: { label: 'Low priority', short: 'Low', cls: 'border-silver/50 text-silver bg-silver/10' },
}

/* Sorting: by when a task is actually needed (deadline, or scheduled date/time
   when there is no deadline). Done tasks always go to the bottom. */
const NONE = 1e16
const dueAt = (t) => {
  if (t.deadline) return new Date(t.deadline).getTime()
  if (t.task_date) return new Date(`${t.task_date}T${(t.due_time || '23:59').slice(0, 5)}`).getTime()
  return NONE
}
const doneLast = (fn) => (a, b) => (a.status === 'done') - (b.status === 'done') || fn(a, b)

const SORTS = {
  soon: doneLast((a, b) => dueAt(a) - dueAt(b) || RANK[a.priority || 'medium'] - RANK[b.priority || 'medium']),
  late: doneLast((a, b) => dueAt(b) - dueAt(a)),
  priority: doneLast((a, b) => RANK[a.priority || 'medium'] - RANK[b.priority || 'medium'] || dueAt(a) - dueAt(b)),
  new: doneLast((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
}

const dueDate = (t) => (t.deadline ? splitDeadline(t.deadline)[0] : '')
const dueClock = (t) => (t.deadline ? splitDeadline(t.deadline)[1] : '')

/* Same rules as the mobile app: a task stays visible from its scheduled date through its due date */
const effDate = (t) => dueDate(t) || t.task_date || ''
const showsOn = (t, day) => {
  if (!t.task_date) return false
  const end = effDate(t) > t.task_date ? effDate(t) : t.task_date
  return t.task_date <= day && day <= end
}

const Dot = ({ s }) => (
  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sc(s) }} />
)

/* Round checkbox (like the reference screenshot). Check mark is drawn with CSS, no icon glyphs. */
function Check({ on, onClick, label, size = 'h-6 w-6' }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`relative shrink-0 rounded-full border-2 transition before:absolute before:-inset-2 before:content-[''] ${size} ${
        on ? 'border-accent bg-accent' : 'border-mute hover:border-accent'
      }`}
    >
      {on && (
        <span className="absolute left-1/2 top-[46%] h-[9px] w-[5px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-b-2 border-r-2 border-ink" />
      )}
    </button>
  )
}

function ProgressBar({ pct }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
      <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

function PriorityPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {Object.entries(PRI).map(([k, p]) => {
        const active = value === k
        const activeCls =
          k === 'high'
            ? 'border-danger bg-danger/15 text-danger ring-1 ring-danger'
            : k === 'medium'
            ? 'border-gold bg-gold/15 text-gold ring-1 ring-gold'
            : 'border-accent bg-accent/15 text-accent ring-1 ring-accent'
        return (
          <button
            type="button"
            key={k}
            onClick={() => onChange(k)}
            aria-pressed={active}
            className={`min-h-[42px] rounded-xl border px-1 text-xs font-bold transition ${
              active ? activeCls : 'border-line bg-surface text-mute hover:text-cream'
            }`}
          >
            {p.short}
          </button>
        )
      })}
    </div>
  )
}

/* =========================================================================
   1. WELCOME OVERLAY
   ========================================================================= */
function Welcome({ onClose }) {
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const [verseIdx, setVerseIdx] = useState(() => Math.floor(Math.random() * VERSES.length))

  const nextPair = () => {
    setQuoteIdx((i) => (i + 1) % QUOTES.length)
    setVerseIdx((i) => (i + 1) % VERSES.length)
  }

  useEffect(() => {
    const handleKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const quote = QUOTES[quoteIdx]
  const verse = VERSES[verseIdx]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <h2 className="mt-3 text-lg font-bold text-cream sm:text-xl">
          Hello, My Baby Yana Galingan mo today. I Love You. Goodluckk.
        </h2>

        <div className="mt-5 rounded-2xl border border-line bg-ink/70 p-4 text-left sm:p-5">
          <p className="text-xs font-semibold text-mute">Motivational Quotes</p>
          <p className="mt-2 text-base font-medium leading-relaxed text-cream sm:text-lg">
            &ldquo;{quote}&rdquo;
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-gold/40 bg-raised p-4 text-left sm:p-5">
          <p className="text-xs font-semibold text-gold">Bible Verse</p>
          <p className="mt-2 font-serif text-base italic leading-relaxed text-cream sm:text-lg">
            &ldquo;{verse.text}&rdquo;
          </p>
          <p className="mt-2 text-right text-xs font-bold text-gold">
            {verse.ref} (KJV)
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} className="btn-primary sm:px-8">
            Start my day
          </button>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   2. 12-HOUR TIME PICKER
   ========================================================================= */
function TimePicker({ value, onChange }) {
  const [h24, m] = value ? value.split(':').map(Number) : [null, 0]
  const ap = h24 != null && h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 == null ? '' : h24 % 12 || 12
  const mins = [...new Set([...Array(12).keys()].map((i) => i * 5).concat(m))].sort((a, b) => a - b)

  const set = (h, mi, a) => {
    if (h === '') return onChange('')
    const hours = (Number(h) % 12) + (a === 'PM' ? 12 : 0)
    onChange(`${String(hours).padStart(2, '0')}:${String(mi).padStart(2, '0')}`)
  }

  const selCls = 'field min-w-0 flex-1 !px-2 sm:flex-none sm:!w-auto'
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
      <select className={selCls} value={h12} onChange={(e) => set(e.target.value, m, ap)} aria-label="Hour">
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="font-bold text-mute">:</span>
      <select className={selCls} value={m} disabled={h12 === ''} onChange={(e) => set(h12, +e.target.value, ap)} aria-label="Minute">
        {mins.map((x) => (
          <option key={x} value={x}>{String(x).padStart(2, '0')}</option>
        ))}
      </select>
      <select className={selCls} value={ap} disabled={h12 === ''} onChange={(e) => set(h12, m, e.target.value)} aria-label="AM or PM">
        <option>AM</option>
        <option>PM</option>
      </select>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear time"
          className="shrink-0 px-1.5 py-2 text-xs font-semibold text-mute hover:text-cream"
        >
          Clear
        </button>
      )}
    </div>
  )
}

/* =========================================================================
   4. TASK FORM (ADD / EDIT) with sub-tasks while creating
   ========================================================================= */
function TaskForm({ period, task, onSave, onCancel }) {
  const editing = Boolean(task)
  const [dl0, dl1] = splitDeadline(task?.deadline)
  const [f, setF] = useState({
    title: task?.title ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    time: task?.due_time?.slice(0, 5) ?? '',
    date: task?.task_date ?? period,
    dlDate: dl0,
    dlTime: dl1,
    notes: task?.notes ?? '',
  })
  const [showNotes, setShowNotes] = useState(Boolean(task?.notes))
  const [subs, setSubs] = useState([])
  const [subText, setSubText] = useState('')

  const up = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target ? e.target.value : e }))

  const addSub = () => {
    const t = subText.trim()
    if (!t) return
    setSubs((s) => [...s, t])
    setSubText('')
  }

  const submit = (e) => {
    e.preventDefault()
    if (!f.title.trim()) return
    const pending = subText.trim()
    const allSubs = pending ? [...subs, pending] : subs
    const dlDate = f.dlDate || (f.dlTime ? f.date || period : '')
    onSave(
      {
        title: f.title.trim(),
        status: f.status,
        priority: f.priority,
        task_date: f.date || period,
        due_time: f.time || null,
        deadline: joinDeadline(dlDate, f.dlTime),
        notes: f.notes.trim() || null,
      },
      allSubs,
    )
    if (!editing) {
      setF({ title: '', status: 'todo', priority: 'medium', time: '', date: period, dlDate: '', dlTime: '', notes: '' })
      setShowNotes(false)
      setSubs([])
      setSubText('')
    }
  }

  const labelCls = 'flex min-w-0 flex-col gap-1.5 text-xs font-medium text-silver'

  return (
    <form onSubmit={submit} className={editing ? 'w-full' : 'card p-4 sm:p-5'}>
      <input
        className="field !bg-ink text-base font-semibold"
        value={f.title}
        onChange={up('title')}
        autoFocus={editing}
        aria-label="Task title"
        placeholder="Task or project name"
      />

      {/* Sub-tasks while creating */}
      {!editing && (
        <div className="mt-3">
          {subs.length > 0 && (
            <ul className="mb-2 divide-y divide-line/60 rounded-xl border border-line/70 bg-ink/50 px-3">
              {subs.map((s, i) => (
                <li key={`${s}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-mute" />
                  <span className="min-w-0 flex-1 break-words text-sm text-cream">{s}</span>
                  <button
                    type="button"
                    onClick={() => setSubs((arr) => arr.filter((_, idx) => idx !== i))}
                    className="shrink-0 px-2 py-1.5 text-xs text-mute hover:text-danger"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              value={subText}
              onChange={(e) => setSubText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSub()
                }
              }}
              placeholder="+ Add sub-task (optional)"
              aria-label="New sub-task"
            />
            <button type="button" className="btn-secondary shrink-0" onClick={addSub}>Add</button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={labelCls}>
          <span>Priority</span>
          <PriorityPicker value={f.priority} onChange={up('priority')} />
        </div>

        {editing && (
          <label className={labelCls}>
            <span>Scheduled date</span>
            <input className="field" type="date" value={f.date} onChange={up('date')} required />
          </label>
        )}

        <div className={labelCls}>
          <span>Scheduled time</span>
          <TimePicker value={f.time} onChange={up('time')} />
        </div>

        {editing && (
          <label className={labelCls}>
            <span>Status</span>
            <select className="field" value={f.status} onChange={up('status')}>
              {ORDER.map((s) => (
                <option key={s} value={s}>{LABEL[s]}</option>
              ))}
            </select>
          </label>
        )}

        <div className={`${labelCls} sm:col-span-2`}>
          <span>Due date and time</span>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <input className="field sm:!w-auto" type="date" value={f.dlDate} onChange={up('dlDate')} aria-label="Deadline date" />
            <TimePicker value={f.dlTime} onChange={up('dlTime')} />
          </div>
        </div>
      </div>

      {showNotes && (
        <textarea
          className="field mt-3"
          rows={3}
          value={f.notes}
          onChange={up('notes')}
          placeholder="Details, links, or instructions"
          aria-label="Notes"
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!showNotes && (
          <button
            type="button"
            className="py-2 text-sm font-semibold text-accent hover:underline"
            onClick={() => setShowNotes(true)}
          >
            + Add notes
          </button>
        )}
        <span className="flex-1" />
        {editing && (
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        )}
        <button type="submit" className="btn-primary">
          {editing ? 'Save changes' : 'Add task'}
        </button>
      </div>
    </form>
  )
}

/* =========================================================================
   5. TASK ROW (compact, click to open) + TASK DETAIL PAGE (sub-tasks live here)
   ========================================================================= */
const PRI_TEXT = { high: 'text-danger', medium: 'text-gold', low: 'text-silver' }

function TaskRow({ task, subs, showDate, board, onOpen, onUpdate }) {
  const done = task.status === 'done'
  const overdue = isOverdue(task) && !done
  const pri = PRI[task.priority || 'medium']
  const subDone = subs.filter((s) => s.status === 'done').length
  const redOrSilver = overdue ? 'text-danger' : 'text-silver'

  const bits = []
  if (showDate && task.task_date) bits.push({ t: fmtShort(task.task_date), cls: redOrSilver })
  if (task.due_time) bits.push({ t: fmtTime(task.due_time), cls: redOrSilver })
  if (task.deadline) bits.push({ t: `Due ${fmtDeadline(task.deadline)}`, cls: overdue ? 'text-danger' : 'text-gold' })
  else if (overdue) bits.push({ t: 'Overdue', cls: 'text-danger' })
  if (subs.length) bits.push({ t: `${subDone}/${subs.length} sub-tasks`, cls: 'text-silver' })
  if (task.status === 'doing') bits.push({ t: 'Doing', style: { color: sc('doing') } })

  const cardBorder = task.priority === 'high' && !done ? 'bg-danger/5' : 'border-line bg-surface'

  return (
    <li
      role="button"
      tabIndex={0}
      draggable={board}
      onDragStart={board ? (e) => e.dataTransfer.setData('id', task.id) : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      style={redBorder(task)}
      className={`card flex cursor-pointer items-center gap-3 p-3.5 transition hover:border-accent ${cardBorder} ${done ? 'opacity-70' : ''}`}
    >
      <Check
        on={done}
        label={done ? 'Mark as to do' : 'Mark as done'}
        onClick={(e) => {
          e.stopPropagation()
          onUpdate(task.id, { status: done ? 'todo' : 'done' })
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={`break-words text-base font-semibold ${done ? 'text-mute line-through' : 'text-cream'}`}>{task.title}</p>
        {bits.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs font-semibold">
            {bits.map((b, i) => (
              <span key={i} className={b.cls} style={b.style}>{b.t}</span>
            ))}
          </div>
        )}
      </div>
      <span className={`shrink-0 text-[11px] font-bold ${PRI_TEXT[task.priority || 'medium']}`}>{pri.short}</span>
    </li>
  )
}

function TaskDetail({ task, subs, onBack, onUpdate, onRemove, onAddSub }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !editing && onBack()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, editing])

  const done = task.status === 'done'
  const overdue = isOverdue(task) && !done
  const pri = PRI[task.priority || 'medium']
  const subDone = subs.filter((s) => s.status === 'done').length
  const pct = subs.length ? Math.round((subDone / subs.length) * 100) : 0

  const addSub = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    onAddSub(task, t)
    setText('')
  }

  return (
    <section className="space-y-4">
      <div>
        <button type="button" className="btn-ghost" onClick={onBack}>Back</button>
      </div>

      <div className="card p-4 sm:p-5" style={redBorder(task)}>
        {editing ? (
          <TaskForm
            period={task.task_date}
            task={task}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
              onUpdate(task.id, patch)
              setEditing(false)
            }}
          />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="pt-1">
                <Check
                  on={done}
                  label={done ? 'Mark as to do' : 'Mark as done'}
                  onClick={() => onUpdate(task.id, { status: done ? 'todo' : 'done' })}
                />
              </div>
              <h2 className={`min-w-0 flex-1 break-words text-xl font-bold ${done ? 'text-mute line-through' : 'text-cream'}`}>
                {task.title}
              </h2>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${pri.cls}`}>{pri.label}</span>
              {task.task_date && (
                <span className={overdue && !task.deadline ? 'text-danger' : 'text-silver'}>
                  Scheduled {fmtShort(task.task_date)}
                  {task.due_time ? `, ${fmtTime(task.due_time)}` : ''}
                </span>
              )}
            </div>

            {task.deadline && (
              <p className={`mt-2 text-sm font-semibold ${overdue ? 'text-danger' : 'text-gold'}`}>
                Due {fmtDeadline(task.deadline)}
                {overdue ? '  (Overdue)' : ''}
              </p>
            )}
            {!task.deadline && overdue && <p className="mt-2 text-sm font-bold text-danger">Overdue</p>}

            {task.notes && (
              <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-line/60 bg-ink/50 p-2.5 text-sm text-silver">
                {task.notes}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdate(task.id, { status: s })}
                  aria-pressed={task.status === s}
                  className="min-h-[42px] rounded-lg border px-1 text-xs font-bold transition"
                  style={
                    task.status === s
                      ? { background: sc(s), borderColor: sc(s), color: '#0d0d0d' }
                      : { borderColor: '#2e2e2e', color: '#8a8a8a' }
                  }
                >
                  {LABEL[s]}
                </button>
              ))}
            </div>

            <div className="mt-2 flex justify-end gap-1">
              <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold text-silver hover:bg-raised" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-raised"
                onClick={() => {
                  if (window.confirm('Delete this task and its sub-tasks?')) {
                    onRemove(task.id)
                    onBack()
                  }
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-cream">Sub-tasks</h3>
          <span className="text-xs font-extrabold text-accent">{subDone} of {subs.length}</span>
        </div>
        {subs.length > 0 && <ProgressBar pct={pct} />}
        {subs.length === 0 && <p className="mt-1 text-xs text-mute">No sub-tasks yet. Add the first one below.</p>}

        <ul className="mt-2 divide-y divide-line/60">
          {subs.map((s) => {
            const sDone = s.status === 'done'
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Check
                  size="h-5 w-5"
                  on={sDone}
                  label={sDone ? 'Mark sub-task as to do' : 'Mark sub-task as done'}
                  onClick={() => onUpdate(s.id, { status: sDone ? 'todo' : 'done' })}
                />
                <span className={`min-w-0 flex-1 break-words text-[15px] ${sDone ? 'text-mute line-through' : 'text-cream'}`}>{s.title}</span>
                <button type="button" onClick={() => onRemove(s.id)} className="shrink-0 px-2 py-1.5 text-xs text-mute hover:text-danger">
                  Remove
                </button>
              </li>
            )
          })}
        </ul>

        <form onSubmit={addSub} className="mt-3 flex gap-2">
          <input
            className="field min-w-0 flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a sub-task"
            aria-label="Add a sub-task"
          />
          <button type="submit" className="btn-secondary shrink-0">Add</button>
        </form>
      </div>
    </section>
  )
}

/* =========================================================================
   6. CALENDAR VIEW
   ========================================================================= */
function CalendarView({ tasks, subsOf, onSelectDate }) {
  const [currentMonth, setCurrentMonth] = useState(today().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today())
  const [year, monthNum] = currentMonth.split('-').map(Number)

  const leadDays = new Date(year, monthNum - 1, 1).getDay()
  const daysInMonth = new Date(year, monthNum, 0).getDate()

  // A task shows on its scheduled date AND on its due date
  const tasksByDate = useMemo(() => {
  const map = {}
  tasks.forEach((t) => {
    const d = dueDate(t) || t.task_date   // due date wins, else scheduled date
    if (d) (map[d] = map[d] || []).push(t)
  })
  return map
}, [tasks])

  // Time this task matters on a given date (due time wins on its due date)
  const clockOn = (t, date) =>
    dueDate(t) === date && dueClock(t) ? dueClock(t).slice(0, 5) : t.due_time ? t.due_time.slice(0, 5) : ''

  const selectedDayTasks = useMemo(() => {
    const list = [...(tasksByDate[selectedDate] || [])]
    return list.sort(
      (a, b) =>
        (a.status === 'done') - (b.status === 'done') ||
        (clockOn(a, selectedDate) || '99:99').localeCompare(clockOn(b, selectedDate) || '99:99') ||
        RANK[a.priority || 'medium'] - RANK[b.priority || 'medium'],
    )
  }, [tasksByDate, selectedDate])

  const cells = [...Array(leadDays).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const [listSort, setListSort] = useState('soon')
  const latestTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done').sort(SORTS[listSort]).slice(0, 8),
    [tasks, listSort],
  )

  const subCount = (t) => {
    const s = subsOf[t.id] || []
    return s.length ? `${s.filter((x) => x.status === 'done').length}/${s.length} sub-tasks` : null
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost shrink-0" onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))} aria-label="Previous month">
          Prev
        </button>
        <h2 className="min-w-0 truncate text-center text-base font-bold text-cream sm:text-xl">{fmtMonth(currentMonth)}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="btn-ghost"
            onClick={() => {
              setCurrentMonth(today().slice(0, 7))
              setSelectedDate(today())
            }}
          >
            Today
          </button>
          <button className="btn-ghost" onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))} aria-label="Next month">
            Next
          </button>
        </div>
      </div>

      <div className="card p-2.5 sm:p-5">
        <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-bold text-mute sm:text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <span key={i} className="aspect-square" />
            const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`
            const list = tasksByDate[dateStr] || []
            const isToday = dateStr === today()
            const isSelected = dateStr === selectedDate

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative flex aspect-square min-w-0 flex-col items-center justify-between rounded-lg border p-0.5 text-xs transition sm:rounded-xl sm:p-1 sm:text-sm ${
                  isSelected
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : isToday
                    ? 'border-gold/70 bg-gold/10 font-bold text-accent'
                    : 'border-transparent text-cream hover:border-line hover:bg-raised'
                }`}
              >
                <span className="pt-0.5 font-semibold">{d}</span>
                <span className="flex h-2 flex-wrap items-center justify-center gap-0.5">
                  {list.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: t.priority === 'high' && t.status !== 'done' ? RED : sc(t.status) }}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card p-3.5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-cream sm:text-base">{fmtLong(selectedDate)}</h3>
            <p className="text-xs text-mute">
              {selectedDayTasks.length} {selectedDayTasks.length === 1 ? 'task' : 'tasks'} due or scheduled, earliest first
            </p>
          </div>
          <button onClick={() => onSelectDate(selectedDate)} className="btn-ghost text-xs text-accent">
            Open in planner
          </button>
        </div>

        {selectedDayTasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-mute">Nothing due or scheduled for this date.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {selectedDayTasks.map((t) => {
              const done = t.status === 'done'
              const isDue = dueDate(t) === selectedDate
              const clock = clockOn(t, selectedDate)
              const sCount = subCount(t)
              return (
                <li
                  key={t.id}
                  style={redBorder(t)}
                  className={`flex gap-3 rounded-xl border p-3 text-sm ${
                    t.priority === 'high' && !done ? 'bg-danger/5' : 'border-line/70 bg-ink/50'
                  } ${done ? 'opacity-70' : ''}`}
                >
                  <div className="w-16 shrink-0 text-right">
                    <p className={`text-xs font-bold ${isDue && !done ? 'text-gold' : 'text-silver'}`}>
                      {clock ? fmtTime(clock) : 'Any time'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase text-mute">{isDue ? 'Due' : 'Scheduled'}</p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5"><Dot s={t.status} /></span>
                      <span className={`min-w-0 flex-1 break-words font-semibold ${done ? 'text-mute line-through' : 'text-cream'}`}>
                        {t.title}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${PRI[t.priority || 'medium'].cls}`}>
                        {PRI[t.priority || 'medium'].short}
                      </span>
                      <span className="rounded border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: sc(t.status), color: sc(t.status) }}>
                        {LABEL[t.status]}
                      </span>
                      {sCount && <span className="text-silver">{sCount}</span>}
                      
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-accent">Upcoming tasks</h3>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-xs font-bold">
            {[['soon', 'Soonest due'], ['late', 'Latest due']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setListSort(k)}
                aria-pressed={listSort === k}
                className={`min-h-[40px] px-3 transition ${listSort === k ? 'bg-raised text-cream' : 'text-mute'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {latestTasks.length === 0 ? (
          <p className="card p-6 text-center text-xs text-mute">No tasks yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {latestTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectDate(t.task_date || today())}
                style={redBorder(t)}
                className={`card flex min-w-0 flex-col justify-between p-3.5 text-left transition hover:border-accent ${
                  t.priority === 'high' ? 'bg-danger/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Dot s={t.status} />
                    <span className="truncate text-sm font-bold text-cream">{t.title}</span>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${PRI[t.priority || 'medium'].cls}`}>
                    {PRI[t.priority || 'medium'].short}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-mute">
                  <span>
                    {t.task_date ? fmtShort(t.task_date) : 'No date'}
                    {t.due_time ? `, ${fmtTime(t.due_time)}` : ''}
                  </span>
                  {t.deadline && <span className="font-medium text-gold">Due {fmtDeadline(t.deadline)}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}


/* =========================================================================
   7. MONTHLY REPORT
   ========================================================================= */
function MonthlyReport({ tasks }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0')
    const items = tasks.filter((task) => {
      // Look for task_month (e.g., "2026-01") first!
      const date = task.task_month || task.task_date || task.created_at?.slice(0, 10)
      return date && date.slice(0, 4) === String(year) && date.slice(5, 7) === month
    })
    const counts = countBy(items)
    const total = items.length
    return {
      key: `${year}-${month}`,
      name: new Date(year, i, 1).toLocaleDateString('en-US', { month: 'long' }),
      short: new Date(year, i, 1).toLocaleDateString('en-US', { month: 'short' }),
      items,
      total,
      todo: counts.todo || 0,
      doing: counts.doing || 0,
      done: counts.done || 0,
      pct: total ? Math.round(((counts.done || 0) / total) * 100) : 0,
    }
  })
  const all = months.flatMap((m) => m.items)
  const totals = countBy(all)
  const total = all.length
  const pct = total ? Math.round(((totals.done || 0) / total) * 100) : 0
  const maxMonth = Math.max(1, ...months.map((m) => m.total))
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7))
  const selected = months.find((m) => m.key === selectedMonth) || months[Math.max(0, Number(today().slice(5, 7)) - 1)]

  const ring = (percent, color = '#e8e8e8') => ({
    background: `conic-gradient(${color} ${percent * 3.6}deg, #2e2e2e ${percent * 3.6}deg 360deg)`,
  })

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" aria-label="Previous year" onClick={() => { setYear((y) => y - 1); setSelectedMonth(`${year - 1}-${today().slice(5, 7)}`) }}>‹</button>
          <h2 className="text-lg font-extrabold tracking-tight text-cream sm:text-xl">{year} Report</h2>
          <button className="btn-ghost" aria-label="Next year" onClick={() => { setYear((y) => y + 1); setSelectedMonth(`${year + 1}-${today().slice(5, 7)}`) }}>›</button>
        </div>
        <span className="text-xs text-mute">{total} {total === 1 ? 'task' : 'tasks'}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.75fr)]">
        <div className="card flex min-h-52 items-center gap-5 p-4 sm:p-5">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full p-2 sm:h-28 sm:w-28" style={ring(pct)}>
            <div className="grid h-full w-full place-items-center rounded-full bg-surface text-lg font-extrabold text-cream">{pct}%</div>
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            {[['To do', totals.todo || 0, '#8a8a8a'], ['Doing', totals.doing || 0, '#c9b458'], ['Done', totals.done || 0, '#35e69a']].map(([label, value, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                <span className="flex-1 text-silver">{label}</span>
                <strong className="text-cream">{value}</strong>
              </div>
            ))}
            <p className="border-t border-line pt-2 text-xs text-mute">{total} tasks in {year}</p>
          </div>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-bold text-cream">Tasks per month</h3>
          <div className="flex h-40 items-end gap-1.5 sm:gap-2.5">
            {months.map((m) => (
              <button key={m.key} title={`${m.name} ${year}: ${m.total} tasks`} onClick={() => setSelectedMonth(m.key)} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end overflow-hidden rounded-t-md">
                  <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md" style={{ height: `${m.total ? Math.max(5, (m.total / maxMonth) * 100) : 0}%` }}>
                    {m.todo + m.doing > 0 && <div style={{ height: `${((m.todo + m.doing) / Math.max(1, m.total)) * 100}%`, background: '#4a4a4a' }} />}
                    {m.done > 0 && <div style={{ height: `${(m.done / Math.max(1, m.total)) * 100}%`, background: '#35e69a' }} />}
                  </div>
                </div>
                <span className={`text-[10px] sm:text-xs ${selectedMonth === m.key ? 'font-extrabold text-accent' : 'text-mute group-hover:text-cream'}`}>{m.short}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {months.map((m) => (
          <button key={m.key} onClick={() => setSelectedMonth(m.key)} className={`card flex min-w-0 items-center gap-3 p-3 text-left transition sm:p-4 ${selectedMonth === m.key ? 'border-gold ring-1 ring-gold/60' : 'hover:border-line'}`}>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full p-1.5 sm:h-16 sm:w-16" style={ring(m.pct, m.total ? '#35e69a' : '#294354')}>
              <div className="grid h-full w-full place-items-center rounded-full bg-surface text-xs font-extrabold text-cream">{m.pct}%</div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-extrabold text-cream">{m.name} {year}</h3>
              {m.total ? (
                <div className="mt-1 space-y-0.5 text-xs">
                  {[['To do', m.todo, '#91a9b8'], ['Doing', m.doing, '#27b9e9'], ['Done', m.done, '#35e69a']].map(([label, value, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      <span className="flex-1 text-silver">{label}</span>
                      <strong className="text-cream">{value}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-1 text-xs text-mute">No tasks</p>}
            </div>
          </button>
        ))}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h3 className="font-extrabold text-cream">{selected.name} {year}</h3>
            <p className="text-xs text-mute">{selected.total} {selected.total === 1 ? 'task' : 'tasks'} · {selected.pct}% completed</p>
          </div>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent" style={{ width: `${selected.pct}%` }} />
          </div>
        </div>
        {selected.items.length ? (
          <div className="space-y-2">
            {selected.items.slice().sort((a, b) => (a.task_date || '').localeCompare(b.task_date || '')).map((task) => (
              <div key={task.id} className="flex items-start gap-3 rounded-xl border border-line/70 bg-ink/40 p-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: task.status === 'done' ? '#35e69a' : task.status === 'doing' ? '#27b9e9' : '#91a9b8' }} />
                <span className={`min-w-0 flex-1 break-words text-sm ${task.status === 'done' ? 'text-mute line-through' : 'text-cream'}`}>{task.title}</span>
                <span className="shrink-0 text-xs text-mute">{task.task_date ? fmtShort(task.task_date) : 'No date'}</span>
              </div>
            ))}
          </div>
        ) : <p className="py-6 text-center text-sm text-mute">No tasks recorded for this month.</p>}
      </div>
    </section>
  )
}

/* =========================================================================
   8. READINGS: subjects (cards) -> open one to add chapters with deadlines
   ========================================================================= */
const chapterDue = (c) => (c.deadline ? new Date(c.deadline).getTime() : NONE)
const chapterOverdue = (c) => Boolean(c.deadline) && c.status !== 'done' && isOverdue(c)

function Readings({ items, subsOf, onAdd, onOpen }) {
  const [title, setTitle] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({ type: 'reading', title: title.trim(), notes: null, status: 'todo', task_date: today() })
    setTitle('')
  }

  const chapters = items.flatMap((r) => subsOf[r.id] || [])
  const doneCount = chapters.filter((c) => c.status === 'done').length
  const percent = chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0
  const sorted = items.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-cream sm:text-2xl">Readings and Study Checklist</h2>
        <p className="text-xs text-mute">Add a subject, then open it to add chapters and deadlines</p>
      </div>

      <form className="card flex flex-col gap-2 p-4 sm:flex-row sm:p-5" onSubmit={submit}>
        <input
          className="field !bg-ink min-w-0 flex-1 text-base"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Subject (e.g. Biology)"
          aria-label="Subject"
        />
        <button type="submit" className="btn-primary shrink-0 sm:px-6">Add subject</button>
      </form>

      <div className="card p-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-silver">
          <span>All chapters</span>
          <span className="text-accent">{doneCount} of {chapters.length} ({percent}%)</span>
        </div>
        <ProgressBar pct={percent} />
      </div>

      {sorted.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-mute">No subjects yet. Add one above.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const chs = subsOf[r.id] || []
            const d = chs.filter((c) => c.status === 'done').length
            const next = chs.filter((c) => c.status !== 'done').sort((a, b) => chapterDue(a) - chapterDue(b))[0]
            const hint = !chs.length
              ? 'Tap to add chapters'
              : next
              ? `Next: ${next.title}${next.deadline ? ` · Due ${fmtDeadline(next.deadline)}` : ''}`
              : 'All chapters done'
            const nextLate = next && chapterOverdue(next)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="card w-full p-4 text-left transition hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-lg font-bold text-cream">{r.title}</p>
                    <span className="shrink-0 text-sm font-bold text-silver">{d}/{chs.length}</span>
                  </div>
                  {r.notes && <p className="mt-1 break-words text-sm text-silver">{r.notes}</p>}
                  <div className="mt-3">
                    <ProgressBar pct={chs.length ? Math.round((d / chs.length) * 100) : 0} />
                  </div>
                  <p className={`mt-3 text-sm ${nextLate ? 'font-semibold text-danger' : 'text-mute'}`}>{hint}</p>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ReadingDetail({ subject, chapters, onBack, onUpdate, onRemove, onAddChapter }) {
  const [editing, setEditing] = useState(false)
  const [eTitle, setETitle] = useState(subject.title)
  const [eNotes, setENotes] = useState(subject.notes || '')
  const [text, setText] = useState('')
  const [dlDate, setDlDate] = useState('')
  const [dlTime, setDlTime] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !editing && onBack()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, editing])

  const done = chapters.filter((c) => c.status === 'done').length
  const pct = chapters.length ? Math.round((done / chapters.length) * 100) : 0
  const list = chapters.slice().sort(doneLast((a, b) => chapterDue(a) - chapterDue(b)))

  const save = (e) => {
    e.preventDefault()
    if (!eTitle.trim()) return
    onUpdate(subject.id, { title: eTitle.trim(), notes: eNotes.trim() || null })
    setEditing(false)
  }

  const addChapter = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    onAddChapter(subject, t, dlDate ? joinDeadline(dlDate, dlTime) : null)
    setText('')
    setDlDate('')
    setDlTime('')
  }

  return (
    <section className="space-y-4">
      <div>
        <button type="button" className="btn-ghost" onClick={onBack}>Back</button>
      </div>

      <div className="card p-4 sm:p-5">
        {editing ? (
          <form onSubmit={save} className="space-y-3">
            <input className="field !bg-ink text-base font-semibold" value={eTitle} onChange={(e) => setETitle(e.target.value)} aria-label="Subject name" autoFocus />
            <textarea className="field" rows={3} value={eNotes} onChange={(e) => setENotes(e.target.value)} placeholder="Description (optional)" aria-label="Description" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setETitle(subject.title); setENotes(subject.notes || '') }}>Cancel</button>
              <button type="submit" className="btn-primary">Save changes</button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="break-words text-xl font-bold text-cream">{subject.title}</h2>
            {subject.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-silver">{subject.notes}</p>}
            <div className="mt-2 flex justify-end gap-1">
              <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold text-silver hover:bg-raised" onClick={() => setEditing(true)}>Edit</button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-raised"
                onClick={() => {
                  if (window.confirm('Delete this subject and its chapters?')) {
                    onRemove(subject.id)
                    onBack()
                  }
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-cream">Chapters</h3>
          <span className="text-xs font-extrabold text-accent">{done} of {chapters.length}</span>
        </div>
        {chapters.length > 0 && <ProgressBar pct={pct} />}
        {chapters.length === 0 && <p className="mt-1 text-xs text-mute">No chapters yet. Add the first one below.</p>}

        <ul className="mt-2 divide-y divide-line/60">
          {list.map((c) => {
            const cDone = c.status === 'done'
            const late = chapterOverdue(c)
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Check
                  size="h-5 w-5"
                  on={cDone}
                  label={cDone ? 'Mark chapter as to read' : 'Mark chapter as done'}
                  onClick={() => onUpdate(c.id, { status: cDone ? 'todo' : 'done' })}
                />
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-[15px] ${cDone ? 'text-mute line-through' : 'text-cream'}`}>{c.title}</p>
                  {c.deadline && (
                    <p className={`text-xs font-semibold ${late ? 'text-danger' : 'text-gold'}`}>
                      Due {fmtDeadline(c.deadline)}{late ? '  (Overdue)' : ''}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => onRemove(c.id)} className="shrink-0 px-2 py-1.5 text-xs text-mute hover:text-danger">Remove</button>
              </li>
            )
          })}
        </ul>

        <form onSubmit={addChapter} className="mt-3 space-y-2">
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a chapter" aria-label="Chapter name" />
          <div className="flex flex-wrap items-center gap-2">
            <input className="field min-w-0 flex-1 sm:!w-auto sm:flex-none" type="date" value={dlDate} onChange={(e) => setDlDate(e.target.value)} aria-label="Chapter deadline date" />
            <TimePicker value={dlTime} onChange={setDlTime} />
            <span className="flex-1" />
            <button type="submit" className="btn-secondary shrink-0">Add</button>
          </div>
          <p className="text-[11px] text-mute">Deadline is optional.</p>
        </form>
      </div>
    </section>
  )
}

/* =========================================================================
   9. POMODORO FOCUS TIMER (keeps running when you switch tabs or close the app)
   ========================================================================= */
const DEFAULT_DURATIONS = { focus: 25, short: 5 }
const MODES = {
  focus: ['Focus', 'focus'],
  short: ['Short break', 'short'],
}
const FOCUS_KEY = 'yana-focus-timer'
const FOCUS_DURATIONS_KEY = 'yana-focus-durations'

function readFocusDurations() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_DURATIONS_KEY)) || {}
    return {
      focus: Number.isFinite(Number(saved.focus)) && Number(saved.focus) >= 1 && Number(saved.focus) <= 180
        ? Number(saved.focus) : DEFAULT_DURATIONS.focus,
      short: Number.isFinite(Number(saved.short)) && Number(saved.short) >= 1 && Number(saved.short) <= 60
        ? Number(saved.short) : DEFAULT_DURATIONS.short,
    }
  } catch {
    return { ...DEFAULT_DURATIONS }
  }
}

function Focus() {
  const [durations, setDurations] = useState(readFocusDurations)
  const [init] = useState(() => {
    let s = {}
    try { s = JSON.parse(localStorage.getItem(FOCUS_KEY)) || {} } catch {}
    const mode = s.mode === 'short' ? 'short' : 'focus'
    const savedDurations = readFocusDurations()
    let left = Number.isFinite(s.left) ? s.left : savedDurations[mode] * 60
    let endAt = s.endAt || null
    let sessions = s.day === today() ? s.sessions || 0 : 0
    if (endAt) {
      const rem = Math.round((endAt - Date.now()) / 1000)
      if (rem <= 0) {
        left = 0
        endAt = null
        if (mode === 'focus') sessions += 1
      } else left = rem
    }
    return { mode, left, endAt, sessions }
  })

  const [mode, setMode] = useState(init.mode)
  const [left, setLeft] = useState(init.left)
  const [endAt, setEndAt] = useState(init.endAt)
  const [sessions, setSessions] = useState(init.sessions)

  const total = durations[mode] * 60
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify({ mode, left, endAt, sessions, day: today() }))
    } catch {}
  }, [mode, left, endAt, sessions])

  useEffect(() => {
    try { localStorage.setItem(FOCUS_DURATIONS_KEY, JSON.stringify(durations)) } catch {}
  }, [durations])

  useEffect(() => {
    if (!endAt) return
    const tick = () => {
      const seconds = Math.max(0, Math.round((endAt - Date.now()) / 1000))
      setLeft(seconds)
      if (seconds === 0) {
        setEndAt(null)
        ding()
        setTimeout(ding, 700)
        if (mode === 'focus') setSessions((n) => n + 1)
      }
    }
    tick()
    const id = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [endAt, mode])

  useEffect(() => {
    document.title = endAt ? `${mmss} · ${MODES[mode][0]}` : TITLE
    return () => { document.title = TITLE }
  }, [mmss, endAt, mode])

  const choose = (nextMode) => {
    setMode(nextMode)
    setEndAt(null)
    setLeft(durations[nextMode] * 60)
  }

  const changeDuration = (targetMode, value) => {
    const max = targetMode === 'focus' ? 180 : 60
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return
    setDurations((current) => ({ ...current, [targetMode]: parsed }))
    if (mode === targetMode && !endAt) setLeft(parsed * 60)
  }

  const start = () => {
    const seconds = left > 0 ? left : total
    setLeft(seconds)
    setEndAt(Date.now() + seconds * 1000)
  }
  const pause = () => {
    setLeft(Math.max(0, Math.round((endAt - Date.now()) / 1000)))
    setEndAt(null)
  }

  const radius = 96
  const circumference = 2 * Math.PI * radius

  return (
    <section className="mx-auto flex max-w-sm flex-col items-center gap-6 py-4">
      <div className="grid w-full grid-cols-2 gap-2">
        {Object.entries(MODES).map(([key, [label]]) => (
          <button
            key={key}
            onClick={() => choose(key)}
            className={`min-h-[44px] rounded-xl border px-2 text-xs font-bold transition sm:text-sm ${
              mode === key ? 'border-accent bg-accent/15 text-cream' : 'border-line text-mute hover:text-cream'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        <label className="space-y-1.5 text-xs font-semibold text-silver">
          <span className="block">Focus minutes</span>
          <input
            className="field text-center"
            type="number"
            min="1"
            max="180"
            step="1"
            value={durations.focus}
            disabled={Boolean(endAt)}
            onChange={(event) => changeDuration('focus', event.target.value)}
            aria-label="Focus duration in minutes"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-silver">
          <span className="block">Break minutes</span>
          <input
            className="field text-center"
            type="number"
            min="1"
            max="60"
            step="1"
            value={durations.short}
            disabled={Boolean(endAt)}
            onChange={(event) => changeDuration('short', event.target.value)}
            aria-label="Break duration in minutes"
          />
        </label>
      </div>
      <p className="-mt-4 w-full text-center text-[11px] text-mute">Edit the durations while paused. Your settings are saved on this device.</p>

      <div className="relative aspect-square w-full max-w-[15rem]">
        <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="#2e2e2e" strokeWidth="12" />
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="#e8e8e8"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - left / total)}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-5xl font-extrabold tabular-nums tracking-tight text-cream">{mmss}</p>
            <p className="mt-1 text-xs font-semibold text-gold">{MODES[mode][0]}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-primary px-8" onClick={endAt ? pause : start}>
          {endAt ? 'Pause' : left < total && left > 0 ? 'Resume' : 'Start'}
        </button>
        <button className="btn-ghost" onClick={() => choose(mode)}>Reset</button>
      </div>

      <p className="text-xs text-mute">
        Completed focus sessions today: <b className="text-sm text-cream">{sessions}</b>
      </p>
    </section>
  )
}

/* =========================================================================
   10. MAIN APP
   ========================================================================= */
/* ---------- Offline-safe sync queue (same behavior as the mobile app) ---------- */
const QUEUE_KEY = 'yana-sync-queue'

const safeInsert = (row) => ({
  id: row.id,
  title: row.title,
  status: row.status,
  type: 'daily',
  task_date: row.task_date || today(),
  due_time: row.due_time || null,
  deadline: row.deadline || null,
  notes: packMetadata(row),
})
const safePatch = (m) => ({
  title: m.title,
  status: m.status,
  task_date: m.task_date || today(),
  due_time: m.due_time || null,
  deadline: m.deadline || null,
  notes: packMetadata(m),
})

async function runOp(op) {
  let res
  if (op.action === 'insert') {
    res = await supabase.from('tasks').insert(op.row)
    if (res.error?.code === '23505') return null // already saved
    if (res.error) res = await supabase.from('tasks').insert(safeInsert(op.row))
  } else if (op.action === 'update') {
    res = await supabase.from('tasks').update(op.row).eq('id', op.id)
    if (res.error) res = await supabase.from('tasks').update(safePatch(op.full)).eq('id', op.id)
  } else {
    res = await supabase.from('tasks').delete().eq('id', op.id)
  }
  return res.error
}

export default function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('yana-tasks-cache') || '[]')
      return saved.map(unpackMetadata)
    } catch {
      return []
    }
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [welcome, setWelcome] = useState(true)
  const [view, setView] = useState('daily')
  const [layout, setLayout] = useState('list')
  const [day, setDay] = useState(today())
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('soon')
  const [q, setQ] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)

  // Open a task or subject as its own page; the browser/phone back button closes it
  const openItem = (id) => {
    window.history.pushState({ yana: id }, '')
    window.scrollTo(0, 0)
    setOpenId(id)
  }
  const closeItem = () => {
    if (window.history.state?.yana) window.history.back()
    else setOpenId(null)
  }
  useEffect(() => {
    const onPop = () => setOpenId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('yana-tasks-cache', JSON.stringify(tasks))
    } catch {}
  }, [tasks])

  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const flushing = useRef(false)
  const queue = useRef(null)
  if (queue.current === null) {
    try { queue.current = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { queue.current = [] }
  }
  const saveQueue = () => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.current)) } catch {}
  }

  // Push pending changes to Supabase, oldest first
  const flush = async () => {
    if (!configured || flushing.current) return queue.current.length === 0
    flushing.current = true
    try {
      while (queue.current.length) {
        const op = queue.current[0]
        let err
        try { err = await runOp(op) } catch (e) { err = { message: String(e?.message || e) } }
        if (err) {
          if (err.code) {
            // Supabase answered and said no (permissions, bad column...). Don't retry forever.
            queue.current.shift()
            setError(`Could not save a change: ${err.message}`)
          } else break // no network, try again later
        } else queue.current.shift()
        saveQueue()
      }
    } finally {
      flushing.current = false
    }
    saveQueue()
    return queue.current.length === 0
  }

  const load = async () => {
    if (!configured) return setLoading(false)
    const clean = await flush()
    if (!clean) return setLoading(false)
    try {
      const { data, error: err } = await supabase.from('tasks').select('*').order('created_at')
      if (err) setError(`Could not load tasks: ${err.message}`)
      else if (data) {
        setTasks(data.map(unpackMetadata))
        setError('')
      }
    } catch {
      // offline: keep cached data
    }
    setLoading(false)
  }
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    loadRef.current()

    const channel = configured
      ? supabase
          .channel('tasks-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
            setTasks((list) => {
              if (payload.eventType === 'DELETE') return list.filter((t) => t.id !== payload.old.id)
              const row = unpackMetadata(payload.new)
              return list.some((t) => t.id === row.id) ? list.map((t) => (t.id === row.id ? row : t)) : [...list, row]
            })
          })
          .subscribe()
      : null

    const handleOnline = () => {
      setOnline(true)
      loadRef.current()
    }
    const handleOffline = () => setOnline(false)
    // Refetch whenever you come back to this tab, like the mobile app does on resume
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) loadRef.current()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleVisible)
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleVisible)
      document.removeEventListener('visibilitychange', handleVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const enqueue = (op) => {
    if (!configured) return
    queue.current.push(op)
    saveQueue()
    if (navigator.onLine) flush()
  }

  // Add task / reading / subtask. Returns the new row so sub-tasks can reference it.
  const add = (row) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const newRow = { ...row, id, priority: row.priority || 'medium', created_at: new Date().toISOString() }
    setTasks((prev) => [...prev, newRow])
    enqueue({ action: 'insert', id, row: newRow })
    return newRow
  }

  const update = (id, patch) => {
    if (patch.status === 'done') ding()
    const existing = tasksRef.current.find((t) => t.id === id) || {}
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    enqueue({ action: 'update', id, row: patch, full: { ...existing, ...patch } })
  }

  const remove = (id) => {
    const kids = tasksRef.current.filter((t) => t.parent_id === id)
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id))
    kids.forEach((k) => enqueue({ action: 'delete', id: k.id }))
    enqueue({ action: 'delete', id })
  }

  const addSubtask = (parent, title, extra = {}) =>
    add({
      type: 'subtask',
      title,
      status: 'todo',
      parent_id: parent.id,
      priority: parent.priority || 'medium',
      task_date: parent.task_date || today(),
      ...extra,
    })

  // Chapters are sub-tasks of a reading subject, with an optional deadline
  const addChapter = (parent, title, deadline) => addSubtask(parent, title, deadline ? { deadline } : {})

  // Planner shows daily tasks plus any older "project" items, so nothing saved before is lost.
  const dailyTasks = useMemo(
    () => tasks.filter((t) => (t.type === 'daily' || t.type === 'project') && !t.parent_id),
    [tasks],
  )
  const subsOf = useMemo(() => {
    const map = {}
    tasks.forEach((t) => {
      if (t.parent_id) (map[t.parent_id] = map[t.parent_id] || []).push(t)
    })
    return map
  }, [tasks])
  const readingsList = useMemo(() => tasks.filter((t) => t.type === 'reading' && !t.parent_id), [tasks])
  const openObj = openId ? tasks.find((t) => t.id === openId) : null

  const isToday = day === today()
  // Unfinished overdue tasks keep showing on today's list until they're done
  const isCarry = (t) => isToday && t.status !== 'done' && isOverdue(t)
  // Tasks stay visible from their scheduled date through their due date
  const inDay = useMemo(
    () => dailyTasks.filter((t) => showsOn(t, day) || isCarry(t)),
    [dailyTasks, day, isToday], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [showPrev, setShowPrev] = useState(true)
  const searching = q.trim() !== ''

  const baseTasks = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (searching ? dailyTasks : inDay)
      .filter(
        (t) =>
          !needle ||
          t.title.toLowerCase().includes(needle) ||
          (t.notes || '').toLowerCase().includes(needle) ||
          (subsOf[t.id] || []).some((s) => s.title.toLowerCase().includes(needle)),
      )
      .filter((t) => !overdueOnly || isOverdue(t))
      .sort(SORTS[sort] || SORTS.soon)
  }, [dailyTasks, inDay, q, searching, overdueOnly, sort, subsOf])

  // Unfinished tasks from earlier days pile up here when you look at today
  const previous = useMemo(() => {
    if (!isToday || searching) return []
    return dailyTasks
      .filter((t) => t.status !== 'done' && effDate(t) && effDate(t) < day && !showsOn(t, day))
      .filter((t) => !isCarry(t))
      .filter((t) => filter === 'all' || t.status === filter)
      .sort(SORTS.soon)
  }, [dailyTasks, isToday, searching, day, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = countBy(baseTasks)
  const shownTasks = filter === 'all' ? baseTasks : baseTasks.filter((t) => t.status === filter)
  const dayCounts = countBy(inDay)
  const dayPct = inDay.length ? Math.round(((dayCounts.done || 0) / inDay.length) * 100) : 0
  const cols = filter === 'all' ? ORDER : [filter]

  const downloadReport = async () => {
    setBusy(true)
    try {
      await exportExcel(tasks)
    } catch {
      setError('Could not export Excel file.')
    }
    setBusy(false)
  }

  const goTab = (tabName) => {
    setOpenId(null)
    setView(tabName)
    setFilter('all')
    setQ('')
  }

  const tabCls = (on) =>
    `min-h-[44px] border-b-2 px-1 text-xs font-bold transition sm:text-sm ${
      on ? 'border-accent text-cream' : 'border-transparent text-mute hover:text-cream'
    }`

  const renderItem = (t, board, withDate = false) => (
    <TaskRow
      key={t.id}
      task={t}
      subs={subsOf[t.id] || []}
      board={board}
      showDate={withDate || searching || (isOverdue(t) && t.status !== 'done')}
      onOpen={() => openItem(t.id)}
      onUpdate={update}
    />
  )

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-3 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-8">
      {welcome && <Welcome onClose={() => setWelcome(false)} />}

      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-cream sm:text-3xl">{TITLE}</h1>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button onClick={downloadReport} disabled={!tasks.length || busy} className="btn-ghost text-xs">
            {busy ? 'Preparing...' : 'Export Excel'}
          </button>
        </div>
      </header>

      <nav className="mb-5 grid grid-cols-5 border-b border-line" role="tablist">
        {[
          ['daily', 'Planner'],
          ['calendar', 'Calendar'],
          ['report', 'Report'],
          ['readings', 'Readings'],
          ['focus', 'Pomodoro'],
        ].map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} className={tabCls(view === v)} onClick={() => goTab(v)}>
            {label}
          </button>
        ))}
      </nav>

      {!online && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 text-xs text-silver">
          <span>Offline mode: changes are saved on your device.</span>
          <span className="font-bold text-accent">Offline</span>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-danger/50 bg-danger/10 px-4 py-2.5 text-xs text-danger">
          <span className="min-w-0">{error}</span>
          <button onClick={() => setError('')} className="shrink-0 font-bold">Dismiss</button>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {openObj ? (
          openObj.type === 'reading' ? (
            <ReadingDetail
              subject={openObj}
              chapters={subsOf[openObj.id] || []}
              onBack={closeItem}
              onUpdate={update}
              onRemove={remove}
              onAddChapter={addChapter}
            />
          ) : (
            <TaskDetail
              task={openObj}
              subs={subsOf[openObj.id] || []}
              onBack={closeItem}
              onUpdate={update}
              onRemove={remove}
              onAddSub={addSubtask}
            />
          )
        ) : (
        <>
        {view === 'calendar' && (
          <CalendarView
            tasks={dailyTasks}
            subsOf={subsOf}
            onSelectDate={(selectedDay) => {
              setDay(selectedDay)
              goTab('daily')
            }}
          />
        )}

        {view === 'report' && <MonthlyReport tasks={tasks} />}

        {view === 'readings' && <Readings items={readingsList} subsOf={subsOf} onAdd={add} onOpen={openItem} />}

        {view === 'focus' && <Focus />}

        {view === 'daily' && (
          <>
            <section className="mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <button className="btn-ghost shrink-0" aria-label="Previous day" onClick={() => setDay(shiftDate(day, -1))}>
                  Prev
                </button>
                <h2 className="min-w-0 flex-1 text-center text-base font-bold text-cream sm:text-xl">{fmtLong(day)}</h2>
                <button className="btn-ghost shrink-0" aria-label="Next day" onClick={() => setDay(shiftDate(day, 1))}>
                  Next
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  className="field min-w-0 flex-1 sm:!w-auto sm:flex-none"
                  type="date"
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  aria-label="Pick a date"
                />
                <button className="btn-ghost shrink-0" onClick={() => setDay(today())}>Today</button>
              </div>
            </section>

            <TaskForm
              key={day}
              period={day}
              onSave={(data, subList) => {
                const parent = add({ type: 'daily', ...data })
                subList.forEach((t) => addSubtask(parent, t))
              }}
            />

            <div className="card mb-4 mt-5 p-3.5">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-silver">
                <span>Progress for this day</span>
                <span className="text-accent">{dayCounts.done || 0} of {inDay.length} ({dayPct}%)</span>
              </div>
              <ProgressBar pct={dayPct} />
            </div>

            <div className="mb-4 space-y-3">
              <input
                className="field sm:max-w-sm"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tasks and sub-tasks"
                aria-label="Search tasks"
              />

              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="field min-w-[10rem] flex-1 text-xs font-bold sm:!w-auto sm:flex-none"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort tasks"
                >
                  <option value="soon">Due soonest first</option>
                  <option value="late">Due latest first</option>
                  <option value="priority">Priority: high first</option>
                  <option value="new">Newest added</option>
                </select>

                <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-xl border border-line text-xs font-bold">
                  {['list', 'board'].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLayout(l)}
                      className={`min-h-[42px] px-4 capitalize transition ${layout === l ? 'bg-raised text-cream' : 'text-mute'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <label className="flex w-full cursor-pointer items-center gap-2 py-1 text-xs font-semibold text-silver sm:w-auto">
                  <input
                    type="checkbox"
                    checked={overdueOnly}
                    onChange={(e) => setOverdueOnly(e.target.checked)}
                    className="h-4 w-4 accent-[#e8e8e8]"
                  />
                  Overdue only
                </label>
              </div>
            </div>

            <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Filter by status">
              {['all', ...ORDER].map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={filter === s}
                  onClick={() => setFilter(s)}
                  className={`flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                    filter === s ? 'border-accent bg-accent/15 text-cream' : 'border-line text-mute hover:text-cream'
                  }`}
                >
                  {s !== 'all' && <Dot s={s} />}
                  {s === 'all' ? 'All' : LABEL[s]}
                  <span className="text-[10px] text-mute">{s === 'all' ? baseTasks.length : counts[s] || 0}</span>
                </button>
              ))}
            </div>

            {searching && <p className="mb-3 text-xs text-mute">Searching across all daily tasks.</p>}

            {previous.length > 0 && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowPrev((v) => !v)}
                  className="mb-1 flex w-full items-center justify-between py-2 text-left"
                >
                  <span className="font-extrabold text-silver">Previous ({previous.length})</span>
                  <span className="text-xs font-bold text-mute">{showPrev ? 'Hide' : 'Show'}</span>
                </button>
                {showPrev && <ul className="space-y-2.5">{previous.map((t) => renderItem(t, false, true))}</ul>}
              </div>
            )}

            {loading && !tasks.length ? (
              <p className="py-12 text-center text-xs text-mute">Loading your tasks...</p>
            ) : layout === 'list' ? (
              shownTasks.length === 0 ? (
                <div className="card p-10 text-center">
                  <p className="text-sm text-mute">
                    {searching ? 'No tasks match your search.' : 'No tasks for this day. Add one above.'}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-1 py-2 font-extrabold text-silver">
                    {isToday ? 'Today' : fmtShort(day)} ({shownTasks.length})
                  </h3>
                  <ul className="space-y-2.5">{shownTasks.map((t) => renderItem(t, false))}</ul>
                </div>
              )
            ) : (
              <div className={`grid gap-4 ${cols.length === 3 ? 'md:grid-cols-3' : 'grid-cols-1'}`}>
                {cols.map((s) => {
                  const items = baseTasks.filter((t) => t.status === s)
                  return (
                    <section
                      key={s}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const id = e.dataTransfer.getData('id')
                        if (id) update(id, { status: s })
                      }}
                      className="min-h-32 min-w-0 rounded-2xl border border-line bg-surface p-3"
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-silver">
                        <Dot s={s} />
                        {LABEL[s]}
                        <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-[10px] text-mute">{items.length}</span>
                      </h3>
                      <ul className="space-y-2">{items.map((t) => renderItem(t, true))}</ul>
                      {items.length === 0 && <p className="py-6 text-center text-xs text-mute">Nothing here</p>}
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      <footer className="mt-10 border-t border-line pt-5 text-center text-xs text-mute">
        &copy; {new Date().getFullYear()} Baby Yana&rsquo;s Task Tracker | Made by Your Baby Riz
      </footer>
    </main>
  )
}