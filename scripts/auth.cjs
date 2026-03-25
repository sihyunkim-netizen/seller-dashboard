/**
 * Google Sheets 인증 스크립트 (최초 1회만 실행)
 * 실행: node scripts/auth.cjs
 */

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const http = require('http')
const url = require('url')

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json')
const TOKEN_PATH = path.join(__dirname, 'token.json')
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000')

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES })

console.log('\n브라우저에서 아래 URL을 열어서 로그인해줘:\n')
console.log(authUrl)
console.log('\n로그인 완료되면 자동으로 인증돼!\n')

// 로컬 서버로 콜백 받기
const server = http.createServer(async (req, res) => {
  const code = new url.URL(req.url, 'http://localhost:3000').searchParams.get('code')
  if (!code) return

  res.end('<h2>인증 완료! 이 창을 닫아도 돼.</h2>')
  server.close()

  const { tokens } = await oAuth2Client.getToken(code)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
  console.log('✅ 인증 완료! token.json 저장됨')
}).listen(3000)
