import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import './App.css'

// ─── 타입 ────────────────────────────────────────────────────────

type DashboardData = {
  updatedAt: string
  period: { start: string; end: string }
  partner: { id: string; name: string }
  kpi: {
    총예약건수: number
    확정건수: number
    취소건수: number
    취소율: number
    총거래액: number
    확정거래액: number
    정산예정금액: number
  }
  options: { name: string; 예약건수: number; 거래액: number }[]
  links: { id: string; 예약건수: number; 거래액: number; 정산예정금액: number }[]
  daily: { date: string; 예약건수: number; 거래액: number }[]
  hourly?: { hour: string; 예약건수: number; 거래액: number }[]
  product?: string
}


type PartnerIndex = {
  partnerId: string
  partnerName: string
  projects: {
    key: string
    product: string
    startDate: string
    endDate: string
    updatedAt: string
    kpi: DashboardData['kpi']
  }[]
}

type PartnerManifest = {
  partnerId: string
  projects: { key: string; product: string; startDate: string; endDate: string }[]
}

// ─── 공통 컴포넌트 ────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────

function HourlyTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ color: '#6b7280', marginBottom: 4 }}>{d.hour}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.stroke, fontWeight: 600 }}>{p.value}건</div>
      ))}
    </div>
  )
}

// ─── 메인 탭 ─────────────────────────────────────────────────────

type GlobalStats = {
  count: number
  avg취소율: number | null
  avg첫날예약건수: number | null
}

function MainTab({ data, hideExtras }: { data: DashboardData; hideExtras?: boolean }) {
  const { kpi, links, daily, hourly } = data
  const [stats, setStats] = useState<GlobalStats | null>(null)

  useEffect(() => {
    fetch('/data/_stats.json').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const pending = kpi.총예약건수 - kpi.확정건수 - kpi.취소건수
  const statusPieData = [
    { name: '확정', value: kpi.확정건수, color: '#10b981' },
    { name: '취소', value: kpi.취소건수, color: '#ef4444' },
    ...(pending > 0 ? [{ name: '대기중', value: pending, color: '#d1d5db' }] : []),
  ]

  // 기간 전체 날짜 채우기 (데이터 없는 날은 0)
  const fullPeriodDaily = (() => {
    const start = new Date(data.period.start)
    const end = new Date(data.period.end)
    const dailyMap: Record<string, number> = {}
    daily.forEach(d => { dailyMap[d.date] = d.예약건수 })
    const result = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      result.push({ date: dateStr, 예약건수: dailyMap[dateStr] ?? 0 })
    }
    return result
  })()

  // 시간별: 첫날 11:00 ~ 마지막날 23:00 고정 (데이터 없는 시간은 0)
  const fullPeriodHourly = (() => {
    const hourlyMap: Record<string, number> = {}
    hourly?.forEach(h => { hourlyMap[h.hour] = h.예약건수 })

    const result = []
    const cur = new Date(`${data.period.start}T11:00:00`)
    const endHour = new Date(`${data.period.end}T23:00:00`)

    while (cur <= endHour) {
      const dateStr = cur.toISOString().slice(0, 10)
      const hh = String(cur.getHours()).padStart(2, '0')
      const label = `${dateStr} ${hh}:00`
      const displayLabel = cur.getHours() === 0 ? dateStr.slice(5) : ''
      result.push({ hour: label, display: displayLabel, 예약건수: hourlyMap[label] ?? 0 })
      cur.setHours(cur.getHours() + 1)
    }
    return result
  })()


  const today = new Date().toISOString().slice(0, 10)
  const actionMessages: string[] = []

  const firstDayCount = daily[0]?.date === data.period.start ? daily[0].예약건수 : 0
  const todayCount = fullPeriodDaily.find(d => d.date === today)?.예약건수 ?? null

  const inProgress = today >= data.period.start && today <= data.period.end
  const diffFromStart = Math.floor((new Date(today).getTime() - new Date(data.period.start).getTime()) / 86400000)
  const daysLeft = Math.ceil((new Date(data.period.end).getTime() - new Date(today).getTime()) / 86400000)
  const isOpenPhase = inProgress && diffFromStart <= 1
  const isClosePhase = inProgress && daysLeft >= 0 && daysLeft <= 2

  // 오픈 1~2일차
  if (isOpenPhase) {
    if (stats?.avg첫날예약건수 != null) {
      if (firstDayCount > stats.avg첫날예약건수) {
        actionMessages.push('첫날 예약건수가 전체 평균보다 높아요! 좋은 출발이에요.')
      } else {
        actionMessages.push('첫날 예약건수가 전체 평균보다 낮아요. 스토리를 통해 오픈 소식을 꾸준히 알려보세요.')
      }
    }
  }

  // 마감 2일전~마감일
  if (isClosePhase) {
    actionMessages.push('마감 임박 콘텐츠로 한정된 혜택임을 강조해보세요!')
    const nextHundred = Math.ceil((kpi.총예약건수 + 1) / 100) * 100
    const toNextHundred = nextHundred - kpi.총예약건수
    if (toNextHundred > 0 && toNextHundred <= 10) {
      actionMessages.push(`${nextHundred}건까지 ${toNextHundred}건 남았어요! 마감 전 마지막으로 한 번 더 독려해보세요`)
    }
  }

  // 상시
  if (inProgress) {
    if (todayCount === 0) {
      actionMessages.push('오늘 새로 들어온 예약이 없어요. 추가 콘텐츠를 발행해 유입을 늘려보세요!')
    }
    if (kpi.총예약건수 < 100) {
      actionMessages.push('근처 맛집 지도, 지역 여행 경비 등 나만의 여행 정보로 저장, 공유, 리그램을 유도해보세요!')
    }
    const recentDays = fullPeriodDaily.filter(d => d.date < today).slice(-3)
    if (recentDays.length >= 2) {
      const recentAvg = recentDays.reduce((s, d) => s + d.예약건수, 0) / recentDays.length
      if (recentAvg > 0 && (todayCount ?? 0) / recentAvg <= 0.4) {
        actionMessages.push('예약 흐름이 둔해지고 있어요. 콘텐츠 재점화 타이밍이에요!')
      }
    }
    const randomPool = [
      "'무엇이든 물어보세요' 팔로워와 소통하는 Q&A를 진행해주세요",
      '넉넉한 예약 기간, 취소 환불 규정을 언급하며 구매 허들을 낮춰보세요',
      '여행 타임라인을 공유하여 하루를 가득 차게 보낼 수 있는 곳임을 강조해보세요!',
    ]
    const seed = parseInt(today.replace(/-/g, '')) % randomPool.length
    actionMessages.push(randomPool[seed])
    if (stats?.avg취소율 != null && kpi.취소율 > stats.avg취소율) {
      const diff = Math.abs(kpi.취소율 - stats.avg취소율).toFixed(1)
      actionMessages.push(`취소율이 평균치에 비해 ${diff}%p 높아요. 추가 콘텐츠 발행으로 새로운 예약을 받아보세요.`)
    }
  }

  return (
    <>
      {!hideExtras && (
        <div className="section-title">
          최근 공동구매{data.product ? ` · ${data.product}` : ''} · {data.period.start} ~ {data.period.end}
        </div>
      )}

      {/* 지표 카드 */}
      <section className="stats-grid">
        <StatCard label="총 예약건수" value={`${kpi.총예약건수}건`} sub="전체 기준" />
        <StatCard label="총 거래액" value={`₩${kpi.총거래액.toLocaleString()}`} sub="전체 기준" />
        <StatCard label="평균 예약단가" value={`₩${kpi.총예약건수 > 0 ? Math.round(kpi.총거래액 / kpi.총예약건수).toLocaleString() : 0}`} sub="총거래액 ÷ 총예약건수" />
        <StatCard label="정산예정금액" value={`₩${kpi.정산예정금액.toLocaleString()}`} sub="취소제외거래액의 2%" />
      </section>

      {/* 다음 액션 코칭 */}
      {!hideExtras && actionMessages.length > 0 && (
        <div className="action-banner">
          <div className="action-banner-title">다음 액션 코칭</div>
          {actionMessages.map((msg, i) => (
            <div key={i} className={i > 0 ? 'action-item' : ''}>💡 {msg}</div>
          ))}
        </div>
      )}

      {/* 예약 추이 */}
      <section className="chart-section">
        <h2 style={{ margin: '0 0 8px 0' }}>예약 추이</h2>
        <p className="chart-insight">업데이트: {new Date(data.updatedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={fullPeriodHourly} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="display" tick={{ fontSize: 11 }} interval={0} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 13 }} />
            <Tooltip content={<HourlyTooltip />} />
            <Line type="monotone" dataKey="예약건수" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* 옵션별 비중 + 마이링크 성과 (50/50) */}
      <div className="half-row">
        <section className="half-section">
          <h2>취소율</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: kpi.취소율 >= 30 ? '#ef4444' : '#111827', lineHeight: 1 }}>
                {kpi.취소율}%
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {statusPieData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                    {d.name} {d.value}건
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => {
                  const total = statusPieData.reduce((s, d) => s + d.value, 0)
                  const pct = total > 0 ? ((value as number) / total * 100).toFixed(0) : 0
                  return [`${value}건 (${pct}%)`, name]
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="half-section">
          <h2>마이링크별 성과</h2>
          <p className="mylink-tip">💬 콘텐츠마다 다른 마이링크를 쓰면 효과적인 채널을 파악할 수 있어요!</p>
          <table className="mylink-table">
            <thead>
              <tr>
                <th>링크 ID</th>
                <th>예약</th>
                <th>거래액</th>
              </tr>
            </thead>
            <tbody>
              {links.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.예약건수}건</td>
                  <td>₩{row.거래액.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* Best Practice */}
      {!hideExtras && <section className="bestpractice-section">
        <h2>Best Practice 성공방정식</h2>
        <p>성공한 공동구매 셀러들의 패턴을 확인하고 내 판매에 적용해보세요.</p>
        <a
          className="bestpractice-btn"
          href="https://www.notion.so/1-2e0edaf1e61a806981acd0dbca839fc4"
          target="_blank"
          rel="noreferrer"
        >
          노션에서 보기 →
        </a>
      </section>}
    </>
  )
}

// ─── 누적 탭 ─────────────────────────────────────────────────────

function HistoryTab({ partnerId, currentKey }: { partnerId: string; currentKey: string }) {
  const [index, setIndex] = useState<PartnerIndex | null>(null)
  const [manifest, setManifest] = useState<PartnerManifest | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, DashboardData>>({})
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 5

  useEffect(() => {
    fetch(`/data/${partnerId}.index.json`).then(r => r.json()).then(setIndex).catch(() => {})
    fetch(`/data/${partnerId}.manifest.json`).then(r => r.json()).then(setManifest).catch(() => {})
  }, [partnerId])

  function toggleDetail(key: string) {
    if (openKey === key) { setOpenKey(null); return }
    setOpenKey(key)
    if (!detailCache[key]) {
      fetch(`/data/${key}.json`).then(r => r.json()).then(d => {
        setDetailCache(prev => ({ ...prev, [key]: d }))
      }).catch(() => {})
    }
  }

  // manifest 기준 전체 프로젝트, 없으면 index 기준
  const allProjects = manifest?.projects ?? (index?.projects ?? [])
  const indexMap = new Map(index?.projects.map(p => [p.key, p]) ?? [])

  // manifest에 현재 프로젝트도 없으면 추가
  const projectKeys = new Set(allProjects.map(p => p.key))
  const extraCurrent = currentKey && !projectKeys.has(currentKey)
    ? [{ key: currentKey, product: '', startDate: currentKey.split('_')[1] ?? '', endDate: currentKey.split('_')[2] ?? '' }]
    : []
  const allSorted = [...extraCurrent, ...allProjects].sort((a, b) => b.startDate.localeCompare(a.startDate))
  const totalPages = Math.ceil(allSorted.length / PAGE_SIZE)
  const paged = allSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <div className="section-title">지금까지 진행한 공동구매</div>

      <div className="history-list">
        {paged.map(p => {
          const indexed = indexMap.get(p.key)
          return (
            <div key={p.key} className={`history-card${indexed ? '' : ' history-card-nodata'}`}>
              <div className="history-header">
                <div>
                  <div className="history-name" style={indexed ? {} : { color: '#9ca3af' }}>
                    {p.product || p.key}
                    {p.key === currentKey && indexed && <span className="live-inline">● 현재</span>}
                  </div>
                  <div className="history-period">{p.startDate} ~ {p.endDate}</div>
                </div>
                {indexed && (
                  <div className="history-right">
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      업데이트 {new Date(indexed.updatedAt).toLocaleDateString('ko-KR')}
                    </span>
                    <button className="toggle-btn" onClick={() => toggleDetail(p.key)}>
                      {openKey === p.key ? '접기 ▲' : '대시보드 ▼'}
                    </button>
                  </div>
                )}
              </div>
              {indexed ? (
                <>
                  <div className="history-stats">
                    <div className="history-stat">
                      <div className="stat-label">총 예약건수</div>
                      <div className="stat-value">{indexed.kpi.총예약건수}건</div>
                    </div>
                    <div className="history-stat">
                      <div className="stat-label">총 거래액</div>
                      <div className="stat-value">₩{indexed.kpi.총거래액.toLocaleString()}</div>
                    </div>
                  </div>
                  {openKey === p.key && (
                    <div style={{ marginTop: 24, borderTop: '1px solid #f3f4f6', paddingTop: 24 }}>
                      {detailCache[p.key]
                        ? <MainTab data={detailCache[p.key]} hideExtras />
                        : <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>불러오는 중...</div>
                      }
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>데이터 업데이트 필요</div>
              )}
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '16px 0' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>이전</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: page === n ? '#6366f1' : '#fff', color: page === n ? '#fff' : '#374151', borderColor: page === n ? '#6366f1' : '#e5e7eb' }}>{n}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>다음</button>
        </div>
      )}

      {/* 광매플 랜딩 */}
      <div className="gwangmaepl-banner">
        <div>
          <div className="gwangmaepl-title">다음 공동구매도 함께 해요!</div>
          <div className="gwangmaepl-sub">셀러 신청하고 더 많은 기회를 잡아보세요.</div>
        </div>
        <a className="gwangmaepl-btn" href="https://myrealtrip-admatchplus.softr.app/market" target="_blank" rel="noreferrer">
          셀러 신청하기 →
        </a>
      </div>
    </>
  )
}

// ─── 메인 앱 ─────────────────────────────────────────────────────


function App() {
  const [searchParams] = useSearchParams()
  const projectKey = searchParams.get('key')

  const [activeTab, setActiveTab] = useState<'main' | 'history'>('main')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectKey) {
      setLoading(false)
      return
    }

    fetch(`/data/${projectKey}.json`)
      .then(r => r.json())
      .then(d => { setDashboardData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectKey])

  // projectKey 없으면 어드민으로 유도
  if (!projectKey && !loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>공동구매 셀러 대시보드</h1>
        </header>
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
            표시할 프로젝트가 없어요
          </div>
          <div style={{ fontSize: '14px', marginBottom: '24px' }}>
            표시할 프로젝트가 없어요
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>공동구매 셀러 대시보드</h1>
          <p className="partner-info">파트너 ID: {dashboardData?.partner?.id ?? '-'} · {dashboardData?.partner?.name ?? '-'}</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'main' ? 'active' : ''}`}
          onClick={() => setActiveTab('main')}
        >
          메인
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          누적
        </button>
      </div>

      {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>데이터 불러오는 중...</div>}
      {!loading && dashboardData && activeTab === 'main' && <MainTab data={dashboardData} />}
      {!loading && activeTab === 'history' && (
        <HistoryTab
          partnerId={projectKey?.split('_')[0] ?? ''}
          currentKey={projectKey ?? ''}
        />
      )}
      {!loading && !dashboardData && <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>데이터를 불러오지 못했어요.</div>}
    </div>
  )
}

export default App
