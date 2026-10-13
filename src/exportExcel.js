import ExcelJS from 'exceljs'
import { ORDER, LABEL, COLOR, MONTHS, iso, monthKey, countBy } from './lib'

const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase()
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } })
const SOFT = { todo: 'FFE2E8F0', doing: 'FFDBEAFE', done: 'FFD1FAE5' }

function canvasImage(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w * 2; c.height = h * 2
  const g = c.getContext('2d')
  g.scale(2, 2); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.textAlign = 'center'
  draw(g)
  return c.toDataURL('image/png')
}
function legend(g, w, y) {
  ORDER.forEach((s, i) => {
    const x = w / 2 - 130 + i * 90
    g.fillStyle = COLOR[s]; g.fillRect(x, y - 9, 12, 12)
    g.fillStyle = '#334155'; g.textAlign = 'left'; g.font = '13px Arial'; g.fillText(LABEL[s], x + 18, y + 1)
  })
}
const donutImg = (c) => canvasImage(340, 300, (g) => {
  const total = c.todo + c.doing + c.done, cx = 170, cy = 140, r = 95
  g.fillStyle = '#1e293b'; g.font = 'bold 16px Arial'; g.fillText('Overall status', cx, 24)
  let a = -Math.PI / 2
  ORDER.forEach((s) => {
    if (!c[s]) return
    const e = a + (c[s] / total) * 2 * Math.PI
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a, e); g.fillStyle = COLOR[s]; g.fill(); a = e
  })
  g.beginPath(); g.arc(cx, cy, 55, 0, 7); g.fillStyle = '#fff'; g.fill()
  g.fillStyle = '#1e293b'; g.textAlign = 'center'; g.font = 'bold 26px Arial'
  g.fillText(total ? Math.round((c.done / total) * 100) + '%' : '0%', cx, cy + 6)
  g.font = '12px Arial'; g.fillStyle = '#64748b'; g.fillText('done', cx, cy + 24)
  legend(g, 340, 270)
})
const barImg = (rows, year) => canvasImage(560, 300, (g) => {
  const max = Math.max(1, ...rows.map((r) => r.c.todo + r.c.doing + r.c.done))
  g.fillStyle = '#1e293b'; g.font = 'bold 16px Arial'; g.fillText(`Tasks per month, ${year}`, 280, 24)
  const base = 245, top = 50, bw = 28, gap = (520 - bw * 12) / 11
  rows.forEach((r, i) => {
    const x = 20 + i * (bw + gap); let y = base
    ORDER.forEach((s) => { const h = (r.c[s] / max) * (base - top); g.fillStyle = COLOR[s]; g.fillRect(x, y - h, bw, h); y -= h })
    g.fillStyle = '#64748b'; g.font = '11px Arial'; g.fillText(MONTHS[i], x + bw / 2, base + 16)
  })
  g.strokeStyle = '#cbd5e1'; g.beginPath(); g.moveTo(14, base); g.lineTo(546, base); g.stroke()
  legend(g, 560, 285)
})

function dataSheet(wb, name, headers, widths, rows, statusCol) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
  ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] }))
  const hr = ws.getRow(1); hr.height = 24
  hr.eachCell((c) => { c.fill = fill('FF1F3A5F'); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle' } })
  rows.forEach((r) => {
    const row = ws.addRow(r.values)
    const cell = row.getCell(statusCol); cell.fill = fill(SOFT[r.status]); cell.font = { bold: true, color: { argb: argb(COLOR[r.status]) } }
    row.alignment = { vertical: 'top', wrapText: true }
  })
  ws.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } }
}

export async function exportExcel(tasks, year) {
  const wb = new ExcelJS.Workbook()
  const rp = wb.addWorksheet('Report', { views: [{ showGridLines: false }] })
  const daily = tasks.filter((t) => t.type === 'daily').sort((a, b) => (a.task_date + (a.due_time || '')).localeCompare(b.task_date + (b.due_time || '')))
  const monthly = tasks.filter((t) => t.type === 'monthly').sort((a, b) => a.task_month.localeCompare(b.task_month) || (a.due_date || '~').localeCompare(b.due_date || '~'))

  const rows = MONTHS.map((m, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    return { key, c: countBy(tasks.filter((t) => monthKey(t) === key)) }
  })
  const all = countBy(rows.flatMap((r) => ORDER.flatMap((s) => Array(r.c[s]).fill({ status: s }))))

  // Report sheet: title, live formulas, charts
  rp.mergeCells('A1:F1')
  const t = rp.getCell('A1'); t.value = `Task Report ${year}`; t.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } }; t.fill = fill('FF1F3A5F'); t.alignment = { vertical: 'middle', indent: 1 }
  rp.getRow(1).height = 38
  const heads = ['Month', 'To do', 'Doing', 'Done', 'Total', '% Done']
  heads.forEach((h, i) => {
    const c = rp.getCell(3, i + 1); c.value = h; c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle' }
    const s = ORDER.find((k) => LABEL[k] === h)
    c.fill = fill(s ? argb(COLOR[s]) : 'FF334155'); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  })
  rp.getRow(3).height = 22
  rows.forEach((r, i) => {
    const n = 4 + i, tot = r.c.todo + r.c.doing + r.c.done
    rp.getCell(n, 8).value = r.key
    rp.getCell(n, 1).value = `${MONTHS[i]} ${year}`
    ;['B', 'C', 'D'].forEach((col, k) => {
      rp.getCell(`${col}${n}`).value = { formula: `COUNTIFS(Daily!$F:$F,$H${n},Daily!$B:$B,${col}$3)+COUNTIFS(Monthly!$E:$E,$H${n},Monthly!$B:$B,${col}$3)`, result: r.c[ORDER[k]] }
    })
    rp.getCell(`E${n}`).value = { formula: `SUM(B${n}:D${n})`, result: tot }
    rp.getCell(`F${n}`).value = { formula: `IF(E${n}=0,0,D${n}/E${n})`, result: tot ? r.c.done / tot : 0 }
    rp.getCell(`F${n}`).numFmt = '0%'
    for (let c = 1; c <= 6; c++) {
      const cell = rp.getCell(n, c); if (c > 1) cell.alignment = { horizontal: 'center' }
      if (i % 2) cell.fill = fill('FFF1F5F9')
    }
  })
  const tr = 16, total = all.todo + all.doing + all.done
  rp.getCell(`A${tr}`).value = 'Total'
  ;['B', 'C', 'D', 'E'].forEach((col, k) => { rp.getCell(`${col}${tr}`).value = { formula: `SUM(${col}4:${col}15)`, result: k < 3 ? all[ORDER[k]] : total } })
  rp.getCell(`F${tr}`).value = { formula: `IF(E${tr}=0,0,D${tr}/E${tr})`, result: total ? all.done / total : 0 }; rp.getCell(`F${tr}`).numFmt = '0%'
  for (let c = 1; c <= 6; c++) { const cell = rp.getCell(tr, c); cell.font = { bold: true }; cell.border = { top: { style: 'medium' } }; if (c > 1) cell.alignment = { horizontal: 'center' } }
  rp.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 3 }, { width: 10, hidden: true }]
  rp.addImage(wb.addImage({ base64: barImg(rows, year), extension: 'png' }), { tl: { col: 8, row: 2 }, ext: { width: 560, height: 300 } })
  rp.addImage(wb.addImage({ base64: donutImg(all), extension: 'png' }), { tl: { col: 8, row: 19 }, ext: { width: 340, height: 300 } })
  rp.getCell('A18').value = 'Counts update automatically when you edit the Daily and Monthly sheets. Charts are a snapshot from download time.'
  rp.getCell('A18').font = { italic: true, color: { argb: 'FF64748B' }, size: 10 }

  dataSheet(wb, 'Daily', ['Title', 'Status', 'Date', 'Time', 'Notes', 'Month'], [38, 11, 12, 9, 40, 10],
    daily.map((x) => ({ status: x.status, values: [x.title, LABEL[x.status], x.task_date, x.due_time?.slice(0, 5) || '', x.notes || '', x.task_date.slice(0, 7)] })), 2)
  dataSheet(wb, 'Monthly', ['Title', 'Status', 'Due date', 'Notes', 'Month'], [38, 11, 12, 40, 10],
    monthly.map((x) => ({ status: x.status, values: [x.title, LABEL[x.status], x.due_date || '', x.notes || '', x.task_month] })), 2)

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = `tasks-${iso(new Date())}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}
