/**
 * Redash → Google Sheets → public/data.json 자동화 스크립트
 *
 * 사용법 (Redash 자동 호출):
 *   node scripts/update-data.cjs <시작일> <종료일> <파트너ID> <GID목록>
 *
 * 사용법 (CSV 수동 지정):
 *   node scripts/update-data.cjs <CSV경로> <시작일> <종료일> <파트너ID> <GID목록>
 *
 * 예시:
 *   node scripts/update-data.cjs 2026-03-23 2026-03-29 129271 2705226,2680807,5548240
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const DATA_DIR = path.join(__dirname, '../public/data')
const REDASH_QUERY_ID = 23544

// public/data 디렉토리 없으면 생성
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// .env 읽기
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, v] = line.split('=')
    if (k && v) process.env[k.trim()] = v.trim()
  })
}
const REDASH_API_KEY = process.env.REDASH_API_KEY

// ─── 인수 파싱 ───────────────────────────────────────────────────
// CSV 없이: node update-data.cjs startDate endDate partnerId gids
// CSV 있을 때: node update-data.cjs csvPath startDate endDate partnerId gids
const args = process.argv.slice(2)
let csvPath, startDate, endDate, partnerId, gidArg, productName

if (args[0] && args[0].endsWith('.csv')) {
  ;[csvPath, startDate, endDate, partnerId, gidArg, productName] = args
} else {
  ;[startDate, endDate, partnerId, gidArg, productName] = args
}

if (!startDate || !endDate || !partnerId || !gidArg) {
  console.error('사용법: node scripts/update-data.cjs <시작일> <종료일> <파트너ID> <GID목록>')
  console.error('예시: node scripts/update-data.cjs 2026-03-23 2026-03-29 129271 2705226,2680807,5548240')
  process.exit(1)
}

const GID_LIST = gidArg.split(',').map(g => g.trim()).filter(Boolean)

// ─── Redash API 호출 ─────────────────────────────────────────────
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function fetchFromRedash() {
  if (!REDASH_API_KEY) throw new Error('REDASH_API_KEY가 .env에 없어요')

  console.log('Redash에서 데이터 가져오는 중...')
  const payload = JSON.stringify({
    parameters: { start_date: startDate, end_date: endDate },
    max_age: 0,
  })

  const postRes = await httpsRequest({
    hostname: 'redash.myrealtrip.net',
    path: `/api/queries/${REDASH_QUERY_ID}/results`,
    method: 'POST',
    headers: {
      'Authorization': `Key ${REDASH_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload)

  const postJson = JSON.parse(postRes.body)

  if (postJson.query_result) return postJson.query_result.data.rows

  if (postJson.job) {
    const jobId = postJson.job.id
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const jobRes = await httpsRequest({
        hostname: 'redash.myrealtrip.net',
        path: `/api/jobs/${jobId}`,
        method: 'GET',
        headers: { 'Authorization': `Key ${REDASH_API_KEY}` },
      })
      const job = JSON.parse(jobRes.body).job
      console.log(`  쿼리 실행 중... (${i + 1}/20)`)
      if (job.status === 3) {
        const resultRes = await httpsRequest({
          hostname: 'redash.myrealtrip.net',
          path: `/api/query_results/${job.query_result_id}`,
          method: 'GET',
          headers: { 'Authorization': `Key ${REDASH_API_KEY}` },
        })
        return JSON.parse(resultRes.body).query_result.data.rows
      }
      if (job.status === 4) throw new Error('Redash 쿼리 실패')
    }
    throw new Error('Redash 타임아웃')
  }

  throw new Error(`Redash 응답 오류: ${postRes.body}`)
}

// ─── CSV 파싱 ────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes }
    else if (c === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += c }
  }
  result.push(current)
  return result
}

const HEADER = [
  'MARKETING_PARTNERSHIP_CD','partner_id','name','BASIS_DATE','RESVE_ID','USER_ID',
  'KIND','RECENT_STATUS','PRODUCT_ID','GID','PRODUCT_TITLE','CONFIRM_KST_DT',
  'CREATE_KST_DATE','TRAVEL_START_KST_DATE','TRAVEL_END_KST_DATE','SALES_KRW_PRICE',
  'COUPON_PRICE','POINT_PRICE','CITY_NM','COUNTRY_NM','REGION_NM',
  'STANDARD_CATEGORY_LV_1_CD','marketing_link_id','partnership_commission',
  'commission_rt','con_margin','CREATE_KST_DT',
]

function aggregate(allRows) {
  const rows = allRows.filter(r => r.partner_id === partnerId && GID_LIST.includes(r.GID))
  console.log(`전체 행: ${allRows.length}개 / 파트너(${partnerId}) + GID 필터 후: ${rows.length}개`)

  const partnerName = rows[0]?.name || rows[0]?.NAME || partnerId

  const confirmed = rows.filter(r => ['confirm', 'finish'].includes((r.RECENT_STATUS || '').toLowerCase()))
  const cancelled = rows.filter(r => (r.RECENT_STATUS || '').toLowerCase() === 'cancel')

  const totalGMV = rows.reduce((s, r) => s + (parseFloat(r.SALES_KRW_PRICE) || 0), 0)
  const confirmedGMV = confirmed.reduce((s, r) => s + (parseFloat(r.SALES_KRW_PRICE) || 0), 0)
  const totalCommission = confirmed.reduce((s, r) => s + (parseFloat(r.partnership_commission) || 0), 0)
  const cancelRate = rows.length > 0 ? parseFloat((cancelled.length / rows.length * 100).toFixed(1)) : 0

  const optMap = {}
  confirmed.forEach(r => {
    const t = r.PRODUCT_TITLE || '기타'
    if (!optMap[t]) optMap[t] = { 예약건수: 0, 거래액: 0 }
    optMap[t].예약건수++
    optMap[t].거래액 += parseFloat(r.SALES_KRW_PRICE) || 0
  })
  const options = Object.entries(optMap)
    .sort((a, b) => b[1].예약건수 - a[1].예약건수)
    .map(([name, v]) => ({ name, 예약건수: v.예약건수, 거래액: Math.round(v.거래액) }))

  const linkMap = {}
  rows.forEach(r => {
    const id = r.marketing_link_id || '없음'
    if (!linkMap[id]) linkMap[id] = { 예약건수: 0, 거래액: 0, 확정거래액: 0 }
    linkMap[id].예약건수++
    linkMap[id].거래액 += parseFloat(r.SALES_KRW_PRICE) || 0
    if (['confirm', 'finish'].includes((r.RECENT_STATUS || '').toLowerCase())) {
      linkMap[id].확정거래액 += parseFloat(r.SALES_KRW_PRICE) || 0
    }
  })
  const links = Object.entries(linkMap)
    .sort((a, b) => b[1].예약건수 - a[1].예약건수)
    .map(([id, v]) => ({ id, 예약건수: v.예약건수, 거래액: Math.round(v.거래액), 정산예정금액: Math.round(v.확정거래액 * 0.02) }))

  const dateMap = {}
  rows.forEach(r => {
    const d = r.BASIS_DATE
    if (!dateMap[d]) dateMap[d] = { 예약건수: 0, 거래액: 0 }
    dateMap[d].예약건수++
    dateMap[d].거래액 += parseFloat(r.SALES_KRW_PRICE) || 0
  })
  const daily = Object.entries(dateMap)
    .sort()
    .map(([date, v]) => ({ date, 예약건수: v.예약건수, 거래액: Math.round(v.거래액) }))

  return { rows, confirmed, cancelled, totalGMV, confirmedGMV, totalCommission, cancelRate, options, links, daily, partnerName }
}

// ─── 메인 ────────────────────────────────────────────────────────
async function main() {
  let allRows

  if (csvPath) {
    // CSV 파일로 실행
    const raw = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean)
    const hasHeader = raw[0].startsWith('MARKETING_PARTNERSHIP_CD')
    const dataLines = hasHeader ? raw.slice(1) : raw
    allRows = dataLines.map(line => {
      const vals = parseCSVLine(line)
      const obj = {}
      HEADER.forEach((h, i) => { obj[h] = vals[i] || '' })
      return obj
    })
  } else {
    // Redash 직접 호출
    const redashRows = await fetchFromRedash()
    allRows = redashRows.map(r => ({
      partner_id: String(r.partner_id || ''),
      name: r.name || '',
      GID: String(r.GID || ''),
      PRODUCT_TITLE: r.PRODUCT_TITLE || '',
      BASIS_DATE: (r.BASIS_DATE || '').slice(0, 10),
      RECENT_STATUS: r.RECENT_STATUS || '',
      SALES_KRW_PRICE: r.SALES_KRW_PRICE || 0,
      marketing_link_id: String(r.marketing_link_id || ''),
      partnership_commission: r.partnership_commission || 0,
    }))
  }

  const { rows, confirmed, cancelled, totalGMV, confirmedGMV, totalCommission, cancelRate, options, links, daily, partnerName } = aggregate(allRows)

  const projectKey = `${partnerId}_${startDate}_${endDate}`

  const output = {
    updatedAt: new Date().toISOString(),
    period: { start: startDate, end: endDate },
    partner: { id: partnerId, name: partnerName },
    kpi: {
      총예약건수: rows.length,
      확정건수: confirmed.length,
      취소건수: cancelled.length,
      취소율: cancelRate,
      총거래액: Math.round(totalGMV),
      확정거래액: Math.round(confirmedGMV),
      정산예정금액: Math.round(confirmedGMV * 0.02),
    },
    options,
    links,
    daily,
  }

  // ─── 파일 저장 ────────────────────────────────────────────────
  const outputPath = path.join(DATA_DIR, `${projectKey}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`✅ 저장 완료: public/data/${projectKey}.json`)

  // ─── 파트너 인덱스 업데이트 ──────────────────────────────────
  const indexPath = path.join(DATA_DIR, `${partnerId}.index.json`)
  let index = { partnerId, partnerName: output.partner.name, projects: [] }
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath))
  }
  const projEntry = {
    key: projectKey,
    product: productName || '',
    startDate,
    endDate,
    updatedAt: output.updatedAt,
    kpi: output.kpi,
  }
  const existingIdx = index.projects.findIndex(p => p.key === projectKey)
  if (existingIdx >= 0) {
    index.projects[existingIdx] = projEntry
  } else {
    index.projects.push(projEntry)
  }
  index.projects.sort((a, b) => b.startDate.localeCompare(a.startDate))
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
  console.log(`✅ 인덱스 업데이트: public/data/${partnerId}.index.json`)

  // ─── git commit + push ────────────────────────────────────────
  const rootPath = path.join(__dirname, '..')
  try {
    const filesToAdd = [`public/data/${projectKey}.json`, `public/data/${partnerId}.index.json`]
    const manifestPath = path.join(DATA_DIR, `${partnerId}.manifest.json`)
    if (fs.existsSync(manifestPath)) filesToAdd.push(`public/data/${partnerId}.manifest.json`)
    execSync(`git add ${filesToAdd.join(' ')}`, { cwd: rootPath })
    execSync(`git commit -m "data: update ${projectKey}"`, { cwd: rootPath })
    execSync('git push', { cwd: rootPath })
    console.log('✅ GitHub 푸시 완료 → Vercel 자동 배포 시작')
  } catch (e) {
    console.warn('⚠️  git push 실패 (git 설정 확인):', e.message)
  }

  console.log(`\n기간: ${startDate} ~ ${endDate}`)
  console.log(`확정 예약: ${confirmed.length}건`)
  console.log(`총 거래액: ₩${Math.round(totalGMV).toLocaleString()}`)
}

main().catch(err => console.error('오류:', err.message))
