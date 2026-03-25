/**
 * 매일 자동 실행용 스크립트
 * 캠페인 설정(campaign.json)을 읽어서 오늘 날짜까지 데이터를 업데이트함
 *
 * 실행: node scripts/run-daily.cjs
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'campaign.json'), 'utf8')
)

const today = new Date()
const endDate = today.toISOString().slice(0, 10)

console.log(`[${new Date().toLocaleString('ko-KR')}] 일일 업데이트 시작`)
console.log(`기간: ${config.startDate} ~ ${endDate}`)

const scriptPath = path.join(__dirname, 'update-data.cjs')
const cmd = `node "${scriptPath}" ${config.startDate} ${endDate} ${config.partnerId} ${config.gids}`

execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') })
