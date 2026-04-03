/**
 * 로컬 API 서버
 * 어드민 페이지의 "데이터 업데이트" 버튼에서 호출됨
 *
 * 실행: node scripts/server.cjs
 * 포트: 3001
 */

const express = require('express')
const cors = require('cors')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { google } = require('googleapis')

const SPREADSHEET_ID = '18rKTPqCA560cDkx-4jltuV22byBDnNuTbwkDfe_9ozk'
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json')
const TOKEN_PATH = path.join(__dirname, 'token.json')

function getSheets() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
  const { client_secret, client_id } = credentials.installed || credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000')
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)))
  return google.sheets({ version: 'v4', auth: oAuth2Client })
}

// 날짜 파싱 - 시트의 진행연도 컬럼 값을 함께 받아 처리
// 형식1: "6/4~10", "6/28~7/4"
// 형식2: "1.2 - 1.8", "12.29 - 1.4"
function parseCampaignDate(str, yearStr) {
  if (!str) return { startDate: '', endDate: '' }
  const s = str.replace(/\s/g, '')
  const baseYear = Number(yearStr) || 2025
  const pad = n => String(n).padStart(2, '0')

  let startMonth, startDay, endMonth, endDay

  if (s.includes('/') && s.includes('~')) {
    // "6/4~10" or "6/28~7/4"
    const [startPart, endPart] = s.split('~')
    if (!startPart || !endPart) return { startDate: '', endDate: '' }
    ;[startMonth, startDay] = startPart.split('/').map(Number)
    if (endPart.includes('/')) {
      ;[endMonth, endDay] = endPart.split('/').map(Number)
    } else {
      endMonth = startMonth
      endDay = Number(endPart)
    }
  } else if (s.includes('.') && s.includes('~')) {
    // "12.9~12.12" or "12.9~12.9"
    const [startPart, endPart] = s.split('~')
    const sp = startPart.split('.')
    const ep = endPart.split('.')
    if (sp.length < 2 || ep.length < 2) return { startDate: '', endDate: '' }
    startMonth = Number(sp[0])
    startDay = Number(sp[1])
    endMonth = Number(ep[0])
    endDay = Number(ep[1])
  } else if (s.includes('.')) {
    // "1.2-1.8" or "12.29-1.4"
    const parts = s.split('-')
    if (parts.length < 2) return { startDate: '', endDate: '' }
    const sp = parts[0].split('.')
    const ep = parts[1].split('.')
    if (sp.length < 2 || ep.length < 2) return { startDate: '', endDate: '' }
    startMonth = Number(sp[0])
    startDay = Number(sp[1])
    endMonth = Number(ep[0])
    endDay = Number(ep[1])
  } else {
    return { startDate: '', endDate: '' }
  }

  // 연말→연초 넘어가는 경우 (예: 12월 시작 → 1월 종료)
  const endYear = endMonth < startMonth ? baseYear + 1 : baseYear
  return {
    startDate: `${baseYear}-${pad(startMonth)}-${pad(startDay)}`,
    endDate: `${endYear}-${pad(endMonth)}-${pad(endDay)}`,
  }
}

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'dist')))


const scriptPath = path.join(__dirname, 'update-data.cjs')
const rootPath = path.join(__dirname, '..')

app.post('/api/update', async (req, res) => {
  const { startDate, endDate, partnerId, gids, product } = req.body
  if (!startDate || !endDate || !partnerId || !gids) {
    return res.status(400).json({ ok: false, error: '파라미터가 부족해요' })
  }
  try {
    // 파트너 전체 프로젝트를 시트에서 읽어 manifest 파일로 저장
    const allProjects = await fetchAllProjects()
    const partnerProjects = allProjects.filter(p => p.partnerId === partnerId)
    const manifestPath = path.join(rootPath, 'public', 'data', `${partnerId}.manifest.json`)
    fs.mkdirSync(path.join(rootPath, 'public', 'data'), { recursive: true })
    fs.writeFileSync(manifestPath, JSON.stringify({
      partnerId,
      projects: partnerProjects.map(p => ({ key: p.key, product: p.product, startDate: p.startDate, endDate: p.endDate })),
    }, null, 2))

    const cmd = `node "${scriptPath}" ${startDate} ${endDate} ${partnerId} "${gids}" "${(product || '').replace(/"/g, '')}"`
    console.log(`[실행] ${cmd}`)
    const output = execSync(cmd, { cwd: rootPath, timeout: 180000 }).toString()
    console.log(output)
    res.json({ ok: true, output })
  } catch (err) {
    console.error(err.message)
    res.status(500).json({ ok: false, error: err.stderr?.toString() || err.message })
  }
})

// 시트에서 전체 프로젝트 목록 파싱
async function fetchAllProjects() {
  const sheets = getSheets()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '공동구매 진행이력!A2:N',
  })
  const rows = response.data.values || []
  return rows
    .map(row => {
      const partnerId = (row[6] || '').trim()
      const email = (row[7] || '').trim()
      const channelName = (row[8] || '').trim()
      const product = (row[9] || '').trim()
      const yearStr = (row[10] || '').trim()
      const campaignDate = (row[11] || '').trim()
      const gid = (row[13] || '').trim()
      const manager = (row[0] || '').trim()
      const { startDate, endDate } = parseCampaignDate(campaignDate, yearStr)
      if (!partnerId || !startDate || !endDate) return null
      const key = `${partnerId}_${startDate}_${endDate}`
      return { key, name: `${channelName} · ${product}`, channelName, product, startDate, endDate, partnerId, gids: gid, manager, email }
    })
    .filter(Boolean)
}

// 시트에서 프로젝트 목록 읽고 static 파일로도 저장
async function fetchAndSaveProjects() {
  const projects = await fetchAllProjects()
  const outPath = path.join(rootPath, 'public', 'data', 'projects.json')
  fs.mkdirSync(path.join(rootPath, 'public', 'data'), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify({ ok: true, projects }, null, 2))
  return projects
}

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await fetchAndSaveProjects()
    res.json({ ok: true, projects })
  } catch (err) {
    console.error(err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// SPA 라우팅 - 모든 경로를 index.html로
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

async function autoUpdate() {
  const today = new Date().toISOString().slice(0, 10)
  let projects
  try {
    projects = await fetchAllProjects()
  } catch (err) {
    console.error('[자동업데이트] 시트 읽기 실패:', err.message)
    return
  }
  const active = projects.filter(p => p.startDate <= today && today <= p.endDate && p.gids)
  if (active.length === 0) {
    console.log('[자동업데이트] 진행중인 공구 없음')
    return
  }
  console.log(`[자동업데이트] ${active.length}개 공구 업데이트 시작`)
  for (const p of active) {
    try {
      const cmd = `node "${scriptPath}" ${p.startDate} ${p.endDate} ${p.partnerId} "${p.gids}" "${(p.product || '').replace(/"/g, '')}"`
      console.log(`[자동업데이트] ${p.name} 업데이트 중...`)
      execSync(cmd, { cwd: rootPath, timeout: 180000 })
      console.log(`[자동업데이트] ${p.name} 완료`)
    } catch (err) {
      console.error(`[자동업데이트] ${p.name} 실패:`, err.message)
    }
  }
}

// 매시 20분, 50분에 실행
const SCHEDULE_MINUTES = [20, 50]
let lastRanMinute = -1

app.listen(3001, () => {
  console.log('API 서버 실행 중: http://localhost:3001')
  console.log('어드민: http://localhost:3001/admin')
  console.log('[자동업데이트] 매시 20분, 50분에 자동 업데이트')
  setInterval(() => {
    const now = new Date()
    const min = now.getMinutes()
    if (SCHEDULE_MINUTES.includes(min) && min !== lastRanMinute) {
      lastRanMinute = min
      autoUpdate()
    }
  }, 10000) // 10초마다 체크
})
