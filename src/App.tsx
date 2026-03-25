import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
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
  Legend,
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
}

const OPTION_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6']

const historyData = [
  {
    id: 0,
    name: '제주 5박6일 패키지',
    period: '2026.03.11 ~ 2026.03.18',
    status: 'live' as const,
    예약건수: 76,
    거래액: 9880000,
    취소율: 4.2,
    전환율: 9.5,
    크로스셀: [
      { name: '제주 렌터카', 예약건수: 18, 거래액: 1980000 },
      { name: '한라산 투어', 예약건수: 11, 거래액: 660000 },
      { name: '성산일출봉 입장권', 예약건수: 24, 거래액: 384000 },
    ],
  },
  {
    id: 1,
    name: '제주 3박4일 패키지',
    period: '2026.02.10 ~ 2026.02.17',
    status: 'done' as const,
    예약건수: 89,
    거래액: 13500000,
    취소율: 3.4,
    전환율: 11.2,
    크로스셀: [
      { name: '제주 렌터카', 예약건수: 22, 거래액: 2420000 },
      { name: '우도 투어', 예약건수: 15, 거래액: 750000 },
    ],
  },
  {
    id: 2,
    name: '오사카 항공권 특가',
    period: '2026.01.20 ~ 2026.01.27',
    status: 'done' as const,
    예약건수: 62,
    거래액: 9200000,
    취소율: 5.1,
    전환율: 8.7,
    크로스셀: [
      { name: '오사카 JR패스', 예약건수: 31, 거래액: 2790000 },
      { name: '유니버셜 스튜디오 입장권', 예약건수: 19, 거래액: 2470000 },
      { name: '도톤보리 맛집 투어', 예약건수: 8, 거래액: 480000 },
    ],
  },
  {
    id: 3,
    name: '방콕 자유여행',
    period: '2025.12.01 ~ 2025.12.08',
    status: 'done' as const,
    예약건수: 41,
    거래액: 6100000,
    취소율: 6.2,
    전환율: 6.3,
    크로스셀: [
      { name: '방콕 시내 투어', 예약건수: 14, 거래액: 840000 },
      { name: '아유타야 당일치기', 예약건수: 9, 거래액: 675000 },
    ],
  },
]

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

// ─── 메인 탭 ─────────────────────────────────────────────────────

function MainTab({ data }: { data: DashboardData }) {
  const { kpi, options, links, daily } = data
  const zeroOptions = options.filter(o => o.예약건수 === 0).map(o => o.name)
  const optionPieData = [...options]
    .sort((a, b) => b.예약건수 - a.예약건수)
    .map(o => ({ name: o.name, value: o.예약건수 }))

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

  return (
    <>
      <div className="section-title">
        최근 공동구매 · {data.period.start} ~ {data.period.end}
      </div>

      {/* 지표 카드 */}
      <section className="stats-grid">
        <StatCard label="총 예약건수" value={`${kpi.총예약건수}건`} sub="전체 기준" />
        <StatCard label="총 거래액" value={`₩${kpi.총거래액.toLocaleString()}`} sub="전체 기준" />
        <StatCard label="취소율" value={`${kpi.취소율}%`} sub="낮을수록 좋아요" />
        <StatCard label="정산예정금액" value={`₩${kpi.정산예정금액.toLocaleString()}`} sub="확정 거래액의 2%" />
      </section>

      {/* 다음 액션 추천 */}
      <div className="action-banner">
        💡 취소율이 <strong>{kpi.취소율}%</strong>예요. 예약 확정을 높이는 콘텐츠를 발행해보세요!
      </div>

      {/* 날짜별 예약 추이 */}
      <section className="chart-section">
        <h2>예약 추이</h2>
        <p className="chart-insight">기간: {data.period.start} ~ {data.period.end} · 업데이트: {new Date(data.updatedAt).toLocaleDateString('ko-KR')}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={fullPeriodDaily} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 13 }} />
            <Tooltip formatter={(v) => [`${v}건`, '예약건수']} />
            <Line
              type="monotone"
              dataKey="예약건수"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* 옵션별 비중 + 마이링크 성과 (50/50) */}
      <div className="half-row">
        <section className="half-section">
          <h2>상품별 판매 비중</h2>
          {zeroOptions.length > 0
            ? <p className="option-insight">⚠️ {zeroOptions.join(', ')} 옵션이 아직 판매되지 않고 있어요.</p>
            : <p className="option-insight">✅ 모든 옵션이 판매되고 있어요!</p>
          }
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={optionPieData}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                paddingAngle={3}
              >
                {optionPieData.map((_, index) => (
                  <Cell key={index} fill={OPTION_COLORS[index % OPTION_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value}건`, '예약']} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
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
                <th>정산예정</th>
              </tr>
            </thead>
            <tbody>
              {links.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.예약건수}건</td>
                  <td>₩{row.거래액.toLocaleString()}</td>
                  <td>₩{row.정산예정금액.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* Best Practice */}
      <section className="bestpractice-section">
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
      </section>
    </>
  )
}

// ─── 누적 탭 ─────────────────────────────────────────────────────

function HistoryTab() {
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <>
      <div className="section-title">지금까지 진행한 공동구매</div>

      <div className="history-list">
        {historyData.map((item) => (
          <div key={item.id} className="history-card">
            <div className="history-header">
              <div>
                <div className="history-name">
                  {item.name}
                  {item.status === 'live' && <span className="live-inline">● LIVE</span>}
                </div>
                <div className="history-period">{item.period}</div>
              </div>
              <div className="history-right">
                <span className="history-content-count">크로스셀 {item.크로스셀.length}건</span>
                <button
                  className="toggle-btn"
                  onClick={() => setOpenId(openId === item.id ? null : item.id)}
                >
                  {openId === item.id ? '접기 ▲' : '크로스셀 상품 ▼'}
                </button>
              </div>
            </div>

            <div className="history-stats">
              <div className="history-stat">
                <div className="stat-label">총 예약건수</div>
                <div className="stat-value">{item.예약건수}건</div>
              </div>
              <div className="history-stat">
                <div className="stat-label">총 거래액</div>
                <div className="stat-value">₩{item.거래액.toLocaleString()}</div>
              </div>
              <div className="history-stat">
                <div className="stat-label">취소율</div>
                <div className="stat-value">{item.취소율}%</div>
              </div>
              <div className="history-stat">
                <div className="stat-label">전환율</div>
                <div className="stat-value">{item.전환율}%</div>
              </div>
              <div className="history-stat">
                <div className="stat-label">정산예정금액</div>
                <div className="stat-value settle">₩{Math.round(item.거래액 * 0.02).toLocaleString()}</div>
              </div>
            </div>

            {openId === item.id && (
              <div className="content-insights">
                <table className="mylink-table">
                  <thead>
                    <tr>
                      <th>크로스셀 상품</th>
                      <th>예약건수</th>
                      <th>총 거래액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.크로스셀.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.예약건수}건</td>
                        <td>₩{c.거래액.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 광매플 랜딩 */}
      <div className="gwangmaepl-banner">
        <div>
          <div className="gwangmaepl-title">다음 공동구매도 함께 해요!</div>
          <div className="gwangmaepl-sub">셀러 신청하고 더 많은 기회를 잡아보세요.</div>
        </div>
        <a className="gwangmaepl-btn" href="#" target="_blank" rel="noreferrer">
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
            어드민 페이지에서 프로젝트를 선택해주세요
          </div>
          <Link
            to="/admin"
            style={{
              background: '#6366f1', color: '#fff', padding: '10px 24px',
              borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px',
            }}
          >
            어드민 페이지로 이동
          </Link>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/admin" style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}>
            어드민
          </Link>
          <div className="live-badge">● LIVE</div>
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
      {!loading && activeTab === 'history' && <HistoryTab />}
      {!loading && !dashboardData && <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>데이터를 불러오지 못했어요.</div>}
    </div>
  )
}

export default App
