import ExcelJS from 'exceljs'

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type JsonRow = Record<string, unknown>
type JsonSheet = { name: string; rows: JsonRow[] }

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function createWorkbook() {
  return new ExcelJS.Workbook()
}

export function addJsonSheet(workbook: ExcelJS.Workbook, name: string, rows: JsonRow[] = []) {
  const worksheet = workbook.addWorksheet(name.slice(0, 31) || 'Sheet1')
  const safeRows = Array.isArray(rows) ? rows : []
  const columns = [...new Set(safeRows.flatMap((row) => Object.keys(row || {})))]

  if (columns.length > 0) {
    worksheet.columns = columns.map((key) => ({ header: key, key, width: Math.min(Math.max(key.length + 4, 12), 35) }))
    safeRows.forEach((row) => worksheet.addRow(row))
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1D4ED8' } }
    worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(columns.length, 26))}1` }
  }

  return worksheet
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBuffer(buffer, filename)
}

export async function downloadJsonWorkbook(sheets: JsonSheet[], filename: string) {
  const workbook = createWorkbook()
  sheets.forEach(({ name, rows }) => addJsonSheet(workbook, name, rows))
  await downloadWorkbook(workbook, filename)
}

export async function readWorkbookRows(file: File): Promise<JsonRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const headers = (worksheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((value) => String(value ?? '').trim())
  return worksheet.getRows(2, Math.max(worksheet.rowCount - 1, 0)).map((row) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1)
    return headers.reduce<JsonRow>((result, header, index) => {
      if (header) result[header] = values[index] ?? ''
      return result
    }, {})
  })
}
