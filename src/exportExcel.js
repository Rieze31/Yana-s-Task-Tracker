import ExcelJS from 'exceljs'
import { ORDER, LABEL, COLOR, iso, countBy } from './lib'

const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase()
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } })
const SOFT = { todo: 'FFE2E8F0', doing: 'FFBAE6FD', done: 'FFBBF7D0' }

function canvasImage(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w * 2
  c.height = h * 2
  const g = c.getContext('2d')
  g.scale(2, 2)
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.textAlign = 'center'
  draw(g)
  return c.toDataURL('image/png')
}

const summaryDonut = (c) => canvasImage(360, 300, (g) => {
  const total = c.todo + c.doing + c.done
  const cx = 180, cy = 135, r = 85
  g.fillStyle = '#1e293b'
  g.font = 'bold 16px Arial'
  g.fillText("Baby Yana's Tasks Completion", cx, 24)
  let a = -Math.PI / 2
  ORDER.forEach((s) => {
    if (!c[s]) return
    const e = a + (c[s] / total) * 2 * Math.PI
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, r, a, e)
    g.fillStyle = COLOR[s]
    g.fill()
    a = e
  })
  g.beginPath()
  g.arc(cx, cy, 52, 0, 7)
  g.fillStyle = '#fff'
  g.fill()
  g.fillStyle = '#1e293b'
  g.textAlign = 'center'
  g.font = 'bold 24px Arial'
  g.fillText(total ? Math.round((c.done / total) * 100) + '%' : '0%', cx, cy + 6)
  g.font = '12px Arial'
  g.fillStyle = '#64748b'
  g.fillText('completed', cx, cy + 24)

  ORDER.forEach((s, i) => {
    const x = cx - 110 + i * 80
    g.fillStyle = COLOR[s]
    g.fillRect(x, 260, 12, 12)
    g.fillStyle = '#334155'
    g.textAlign = 'left'
    g.font = '12px Arial'
    g.fillText(LABEL[s], x + 16, 270)
  })
})

function styleHeader(row) {
  row.height = 24
  row.eachCell((c) => {
    c.fill = fill('FF1B3828')
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { vertical: 'middle' }
  })
}

export async function exportExcel(allTasks) {
  const wb = new ExcelJS.Workbook()
  const dailyTasks = allTasks.filter((t) => t.type === 'daily' && !t.parent_id).sort((a, b) => (b.task_date || '').localeCompare(a.task_date || ''))
  const projectTasks = allTasks.filter((t) => t.type === 'project')
  const subtasksMap = {}
  allTasks.filter((t) => t.parent_id).forEach((s) => {
    subtasksMap[s.parent_id] = subtasksMap[s.parent_id] || []
    subtasksMap[s.parent_id].push(s)
  })
  const readings = allTasks.filter((t) => t.type === 'reading')

  // Summary sheet
  const wsSummary = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  wsSummary.mergeCells('A1:E1')
  const titleCell = wsSummary.getCell('A1')
  titleCell.value = "Baby Yana's Task Tracker - Summary"
  titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = fill('FF1B3828')
  titleCell.alignment = { vertical: 'middle', indent: 1 }
  wsSummary.getRow(1).height = 36

  const dailyCounts = countBy(dailyTasks)
  const totalDaily = dailyCounts.todo + dailyCounts.doing + dailyCounts.done
  const doneReadings = readings.filter((r) => r.status === 'done').length

  const stats = [
    ['Metric', 'Count'],
    ['Total Daily Tasks', totalDaily],
    ['Daily Tasks Done', dailyCounts.done],
    ['Daily Tasks In Progress', dailyCounts.doing],
    ['Daily Tasks To Do', dailyCounts.todo],
    ['Total Projects', projectTasks.length],
    ['Readings Completed', `${doneReadings} / ${readings.length}`],
    ['Export Date', new Date().toLocaleDateString()],
  ]

  stats.forEach((row, i) => {
    const r = wsSummary.getRow(3 + i)
    r.getCell(1).value = row[0]
    r.getCell(2).value = row[1]
    if (i === 0) {
      r.getCell(1).font = { bold: true }
      r.getCell(2).font = { bold: true }
      r.fill = fill('FFE2E8F0')
    }
  })
  wsSummary.columns = [{ width: 26 }, { width: 20 }]

  try {
    const imgData = summaryDonut(dailyCounts)
    const imgId = wb.addImage({ base64: imgData, extension: 'png' })
    wsSummary.addImage(imgId, { tl: { col: 3, row: 2 }, ext: { width: 360, height: 300 } })
  } catch {}

  // Daily Tasks Sheet
  const wsDaily = wb.addWorksheet('Daily Tasks', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsDaily.columns = [
    { header: 'Title', width: 34 },
    { header: 'Priority', width: 14 },
    { header: 'Status', width: 12 },
    { header: 'Date', width: 14 },
    { header: 'Time', width: 12 },
    { header: 'Deadline', width: 22 },
    { header: 'Notes', width: 36 },
  ]
  styleHeader(wsDaily.getRow(1))
  dailyTasks.forEach((t) => {
    const row = wsDaily.addRow([
      t.title,
      t.priority?.toUpperCase() || 'MEDIUM',
      LABEL[t.status] || t.status,
      t.task_date || '',
      t.due_time || '',
      t.deadline ? new Date(t.deadline).toLocaleString() : '',
      t.notes || '',
    ])
    const statusCell = row.getCell(3)
    if (SOFT[t.status]) {
      statusCell.fill = fill(SOFT[t.status])
      statusCell.font = { bold: true, color: { argb: argb(COLOR[t.status]) } }
    }
  })

  // Projects Sheet
  const wsProj = wb.addWorksheet('Projects & Subtasks', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsProj.columns = [
    { header: 'Project Name', width: 28 },
    { header: 'Subtask Title', width: 32 },
    { header: 'Priority', width: 14 },
    { header: 'Status', width: 12 },
    { header: 'Deadline', width: 20 },
    { header: 'Project Notes', width: 30 },
  ]
  styleHeader(wsProj.getRow(1))
  projectTasks.forEach((p) => {
    const subs = subtasksMap[p.id] || []
    if (subs.length === 0) {
      wsProj.addRow([p.title, '(No subtasks)', p.priority?.toUpperCase() || 'MEDIUM', LABEL[p.status] || p.status, p.deadline ? new Date(p.deadline).toLocaleString() : '', p.notes || ''])
    } else {
      subs.forEach((s) => {
        const row = wsProj.addRow([p.title, s.title, (s.priority || p.priority || 'medium').toUpperCase(), LABEL[s.status] || s.status, p.deadline ? new Date(p.deadline).toLocaleString() : '', p.notes || ''])
        const statusCell = row.getCell(4)
        if (SOFT[s.status]) {
          statusCell.fill = fill(SOFT[s.status])
          statusCell.font = { bold: true, color: { argb: argb(COLOR[s.status]) } }
        }
      })
    }
  })

  // Readings Sheet
  const wsRead = wb.addWorksheet('Readings', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsRead.columns = [
    { header: 'Title / Chapter', width: 36 },
    { header: 'Status', width: 14 },
    { header: 'Subject / Notes', width: 34 },
    { header: 'Date Added', width: 16 },
  ]
  styleHeader(wsRead.getRow(1))
  readings.forEach((r) => {
    const row = wsRead.addRow([
      r.title,
      r.status === 'done' ? 'Completed' : 'To Read',
      r.notes || '',
      r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
    ])
    const statusCell = row.getCell(2)
    if (r.status === 'done') {
      statusCell.fill = fill(SOFT.done)
      statusCell.font = { bold: true, color: { argb: argb(COLOR.done) } }
    }
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `baby-yana-tasks-${iso(new Date())}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
