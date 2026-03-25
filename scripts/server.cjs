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

const app = express()
app.use(cors())
app.use(express.json())

const scriptPath = path.join(__dirname, 'update-data.cjs')
const rootPath = path.join(__dirname, '..')

app.post('/api/update', (req, res) => {
  const { startDate, endDate, partnerId, gids } = req.body
  if (!startDate || !endDate || !partnerId || !gids) {
    return res.status(400).json({ ok: false, error: '파라미터가 부족해요' })
  }
  try {
    const cmd = `node "${scriptPath}" ${startDate} ${endDate} ${partnerId} ${gids}`
    console.log(`[실행] ${cmd}`)
    const output = execSync(cmd, { cwd: rootPath, timeout: 180000 }).toString()
    console.log(output)
    res.json({ ok: true, output })
  } catch (err) {
    console.error(err.message)
    res.status(500).json({ ok: false, error: err.stderr?.toString() || err.message })
  }
})

app.listen(3001, () => {
  console.log('API 서버 실행 중: http://localhost:3001')
  console.log('어드민 페이지에서 데이터 업데이트 버튼을 누르면 여기서 실행됩니다.')
})
