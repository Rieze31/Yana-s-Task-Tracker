export const ORDER = ['todo', 'doing', 'done']
export const LABEL = { todo: 'To do', doing: 'Doing', done: 'Done' }
export const COLOR = { todo: '#64748b', doing: '#60a5fa', done: '#34d399' }
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const iso = (d) => d.toLocaleDateString('en-CA')
export const today = () => iso(new Date())
const parts = (s) => s.split('-').map(Number)
export const shiftDate = (s, n) => { const [y, m, d] = parts(s); return iso(new Date(y, m - 1, d + n)) }
export const shiftMonth = (s, n) => { const [y, m] = parts(s); return iso(new Date(y, m - 1 + n, 1)).slice(0, 7) }
export const monthEnd = (s) => { const [y, m] = parts(s); return iso(new Date(y, m, 0)) }
export const fmtLong = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const fmtMonth = (s) => new Date(s + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
export const fmtShort = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
export const fmtTime = (t) => (t ? `${+t.slice(0, 2) % 12 || 12}:${t.slice(3, 5)} ${+t.slice(0, 2) < 12 ? 'AM' : 'PM'}` : '')

// Month a task counts toward in reports (daily tasks use their date).
export const monthKey = (t) => (t.type === 'daily' ? t.task_date?.slice(0, 7) : t.task_month)
export const countBy = (list) => { const c = { todo: 0, doing: 0, done: 0 }; list.forEach((t) => c[t.status]++); return c }

export const fmtDeadline = (s) =>
  new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
export const splitDeadline = (s) => {
  if (!s) return ['', '']
  const d = new Date(s)
  return [iso(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`]
}
export const joinDeadline = (date, time) => (date ? new Date(`${date}T${time || '23:59'}`).toISOString() : null)
export const isOverdue = (t) => {
  if (t.status === 'done') return false
  if (t.deadline) return new Date(t.deadline) < new Date()
  const when = t.type === 'daily' ? t.task_date : t.due_date
  return Boolean(when) && when < today()
}

// "Ding" sound (no audio file needed)
let ctx
export function ding() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    const t = ctx.currentTime
    ;[880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.12
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(0.25, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6)
      o.connect(g).connect(ctx.destination); o.start(s); o.stop(s + 0.65)
    })
  } catch {}
}
