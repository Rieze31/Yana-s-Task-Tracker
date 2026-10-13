export const ORDER = ['todo', 'doing', 'done']
export const LABEL = { todo: 'To do', doing: 'Doing', done: 'Done' }
export const COLOR = { todo: '#94a3b8', doing: '#38bdf8', done: '#4ade80' }

export const PRI = {
  high: { label: 'High Priority', short: 'High', cls: 'border-red-500/70 bg-red-950/40 text-red-300 font-bold', dot: '#ef4444' },
  medium: { label: 'Medium', short: 'Med', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300', dot: '#f59e0b' },
  low: { label: 'Low', short: 'Low', cls: 'border-emerald-600/30 bg-emerald-950/20 text-emerald-300', dot: '#10b981' },
}
export const RANK = { high: 0, medium: 1, low: 2 }

export const iso = (d) => d.toLocaleDateString('en-CA')
export const today = () => iso(new Date())
const parts = (s) => s.split('-').map(Number)
export const shiftDate = (s, n) => { const [y, m, d] = parts(s); return iso(new Date(y, m - 1, d + n)) }
export const shiftMonth = (s, n) => { const [y, m] = parts(s); return iso(new Date(y, m - 1 + n, 1)).slice(0, 7) }
export const fmtLong = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const fmtMonth = (s) => new Date(s + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
export const fmtShort = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
export const fmtTime = (t) => (t ? `${+t.slice(0, 2) % 12 || 12}:${t.slice(3, 5)} ${+t.slice(0, 2) < 12 ? 'AM' : 'PM'}` : '')

export const countBy = (list) => {
  const c = { todo: 0, doing: 0, done: 0 }
  list.forEach((t) => { if (c[t.status] !== undefined) c[t.status]++ })
  return c
}

export const fmtDeadline = (s) => {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return s
  }
}

export const splitDeadline = (s) => {
  if (!s) return ['', '']
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return ['', '']
    return [iso(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`]
  } catch {
    return ['', '']
  }
}

export const joinDeadline = (date, time) => (date ? new Date(`${date}T${time || '23:59'}`).toISOString() : null)

export const isOverdue = (t) => {
  if (t.status === 'done') return false
  if (t.deadline) {
    try {
      return new Date(t.deadline).getTime() < Date.now()
    } catch {
      return false
    }
  }
  return Boolean(t.task_date) && t.task_date < today()
}

// Seamless metadata pack/unpack for database backwards compatibility
export function packMetadata(row) {
  const meta = {}
  if (row.priority && row.priority !== 'medium') meta.pri = row.priority
  if (row.type && !['daily', 'monthly'].includes(row.type)) meta.type = row.type
  if (row.parent_id) meta.pid = row.parent_id

  let notes = row.notes || ''
  // Strip any old metadata header first
  notes = notes.replace(/\[\[YANA:(.*?)\]\]\n?/g, '').trim()

  if (Object.keys(meta).length === 0) return notes || null
  const tag = `[[YANA:${JSON.stringify(meta)}]]`
  return notes ? `${tag}\n${notes}` : tag
}

export function unpackMetadata(row) {
  let notes = row.notes || ''
  let priority = row.priority || 'medium'
  let type = row.type || 'daily'
  let parent_id = row.parent_id || null

  const match = notes.match(/\[\[YANA:(.*?)\]\]\n?/)
  if (match) {
    try {
      const meta = JSON.parse(match[1])
      if (meta.pri) priority = meta.pri
      if (meta.type) type = meta.type
      if (meta.pid) parent_id = meta.pid
      notes = notes.replace(match[0], '').trim()
    } catch {}
  }
  return { ...row, notes: notes || null, priority, type, parent_id }
}

let ctx
export function ding() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    const t = ctx.currentTime
    ;[880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const s = t + i * 0.12
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(0.25, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6)
      o.connect(g).connect(ctx.destination)
      o.start(s)
      o.stop(s + 0.65)
    })
  } catch {}
}
