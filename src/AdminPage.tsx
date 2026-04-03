import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Admin.css'

type Project = {
  key: string
  name: string
  channelName: string
  product: string
  startDate: string
  endDate: string
  partnerId: string
  gids: string
  manager?: string
  category?: string
}

type SellerGroup = {
  partnerId: string
  channelName: string
  latestDate: string
  projects: Project[]
}

const PAGE_SIZE = 8

export default function AdminPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})
  const [updateTimes, setUpdateTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('updateTimes') || '{}') } catch { return {} }
  })
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/data/projects.json')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setProjects(data.projects)
        setLoadingProjects(false)
      })
      .catch(() => setLoadingProjects(false))
  }, [])

  // 파트너ID 기준 그룹핑 + 최근 진행순 정렬
  const sellerGroups: SellerGroup[] = Object.values(
    projects.reduce((acc, p) => {
      if (!acc[p.partnerId]) {
        acc[p.partnerId] = {
          partnerId: p.partnerId,
          channelName: p.channelName,
          latestDate: p.startDate,
          projects: [],
        }
      }
      if (p.startDate > acc[p.partnerId].latestDate) {
        acc[p.partnerId].latestDate = p.startDate
      }
      acc[p.partnerId].projects.push(p)
      return acc
    }, {} as Record<string, SellerGroup>)
  ).sort((a, b) => b.latestDate.localeCompare(a.latestDate))

  // 각 그룹 내 프로젝트도 최근 순 정렬
  sellerGroups.forEach(g => {
    g.projects.sort((a, b) => b.startDate.localeCompare(a.startDate))
  })

  const today = new Date().toISOString().slice(0, 10)

  // 현재 진행중인 셀러: 오늘 날짜가 startDate~endDate 사이인 프로젝트가 있는 그룹
  const activeGroups = sellerGroups
    .map(g => ({
      ...g,
      activeProjects: g.projects.filter(p => p.startDate <= today && today <= p.endDate),
    }))
    .filter(g => g.activeProjects.length > 0)

  const filteredGroups = sellerGroups.filter(g =>
    g.channelName.toLowerCase().includes(search.toLowerCase()) ||
    g.partnerId.includes(search)
  )

  const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE)
  const pagedGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleGroup(partnerId: string) {
    setOpenGroups(s => ({ ...s, [partnerId]: !s[partnerId] }))
  }

  async function handleUpdate(project: Project) {
    setUpdateStatus(s => ({ ...s, [project.key]: 'loading' }))
    try {
      const res = await fetch('http://localhost:3001/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: project.startDate,
          endDate: project.endDate,
          partnerId: project.partnerId,
          gids: project.gids,
          product: project.product,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setUpdateStatus(s => ({ ...s, [project.key]: 'ok' }))
        setUpdateTimes(s => {
          const now = new Date()
          const pad = (n: number) => String(n).padStart(2, '0')
          const timeStr = `${now.toLocaleDateString('ko-KR')} ${pad(now.getHours())}:${pad(now.getMinutes())}`
          const next = { ...s, [project.key]: timeStr }
          localStorage.setItem('updateTimes', JSON.stringify(next))
          return next
        })
        setTimeout(() => setUpdateStatus(s => ({ ...s, [project.key]: 'idle' })), 3000)
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      console.error(err)
      setUpdateStatus(s => ({ ...s, [project.key]: 'error' }))
      setTimeout(() => setUpdateStatus(s => ({ ...s, [project.key]: 'idle' })), 4000)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>공동구매 셀러 대시보드 어드민 페이지</h1>
        <p className="admin-sub">현재 진행중인 프로젝트는 매시 20분, 50분에 자동 업데이트 됩니다</p>
        <p className="admin-sub">데이터 업데이트는 <a href="https://docs.google.com/spreadsheets/d/18rKTPqCA560cDkx-4jltuV22byBDnNuTbwkDfe_9ozk/edit?gid=0#gid=0" target="_blank" rel="noreferrer">공동구매 진행이력 시트</a> 업데이트 후 김시현에게 문의</p>
      </header>

      {/* 현재 진행중 섹션 */}
      <section className="admin-list-section">
        <div className="admin-list-header">
          <h2>현재 진행중 {!loadingProjects && activeGroups.length > 0 && <span className="active-badge">{activeGroups.length}명</span>}</h2>
        </div>
        {loadingProjects && <p className="admin-empty">불러오는 중...</p>}
        {!loadingProjects && activeGroups.length === 0 && (
          <p className="admin-empty">진행중인 셀러가 없습니다.</p>
        )}
        {!loadingProjects && activeGroups.length > 0 && (
          <div className="project-list">
            {activeGroups.map(g => {
              const latestProject = g.projects[0]
              return (
                <div key={g.partnerId} className="seller-group">
                  <div className="seller-group-header">
                    <div className="toggle-group-btn" style={{ cursor: 'default' }}>
                      <span className="seller-channel">{g.channelName}</span>
                      <span className="seller-meta">파트너ID: {g.partnerId}</span>
                    </div>
                    <button
                      className="btn-dashboard"
                      onClick={() => navigate(`/?key=${latestProject.key}`)}
                    >
                      대시보드
                    </button>
                  </div>
                  {g.activeProjects.map(p => {
                    const status = updateStatus[p.key] || 'idle'
                    const hasGid = !!p.gids
                    return (
                      <div key={p.key} className="project-card">
                        <div className="project-info">
                          <div className="project-name">{p.product}</div>
                          <div className="project-meta">
                            {p.startDate} ~ {p.endDate}
                            {p.manager && ` · ${p.manager}`}
                            {p.category && ` · ${p.category}`}
                            {!hasGid && <span className="no-gid"> · GID 없음</span>}
                          </div>
                        </div>
                        <div className="project-actions">
                          <button
                            className={`btn-update ${hasGid ? status : 'disabled'}`}
                            onClick={() => hasGid && handleUpdate(p)}
                            disabled={!hasGid || status === 'loading'}
                            title={!hasGid ? 'GID가 없어서 업데이트할 수 없어요' : ''}
                          >
                            {!hasGid && 'GID 없음'}
                            {hasGid && status === 'idle' && '데이터 업데이트'}
                            {hasGid && status === 'loading' && '업데이트 중...'}
                            {hasGid && status === 'ok' && '완료'}
                            {hasGid && status === 'error' && '실패 (서버 확인)'}
                          </button>
                          {updateTimes[p.key] && (
                            <div className="update-time">{updateTimes[p.key]}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="admin-list-section">
        <div className="admin-list-header">
          <h2>셀러 관리 {!loadingProjects && `(${filteredGroups.length}명)`}</h2>
          <input
            className="search-input"
            type="text"
            placeholder="채널명 · 파트너ID 검색"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        {loadingProjects && <p className="admin-empty">불러오는 중...</p>}
        {!loadingProjects && filteredGroups.length === 0 && (
          <p className="admin-empty">결과가 없어요.</p>
        )}

        <div className="project-list">
          {pagedGroups.map(g => {
            const isOpen = !!openGroups[g.partnerId]
            const latestProject = g.projects[0]
            return (
              <div key={g.partnerId} className="seller-group">
                {/* 셀러 헤더 */}
                <div className="seller-group-header">
                  <button className="toggle-group-btn" onClick={() => toggleGroup(g.partnerId)}>
                    <span className="seller-channel">{g.channelName}</span>
                    <span className="seller-meta">파트너ID: {g.partnerId} · {g.projects.length}개 공구</span>
                    <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  <button
                    className="btn-dashboard"
                    onClick={() => navigate(`/?key=${latestProject.key}`)}
                  >
                    대시보드
                  </button>
                </div>

                {/* 프로젝트 토글 목록 */}
                {isOpen && g.projects.map(p => {
                  const status = updateStatus[p.key] || 'idle'
                  const hasGid = !!p.gids
                  return (
                    <div key={p.key} className="project-card">
                      <div className="project-info">
                        <div className="project-name">{p.product}</div>
                        <div className="project-meta">
                          {p.startDate} ~ {p.endDate}
                          {p.manager && ` · ${p.manager}`}
                          {p.category && ` · ${p.category}`}
                          {!hasGid && <span className="no-gid"> · GID 없음</span>}
                        </div>
                      </div>
                      <div className="project-actions">
                        <button
                          className={`btn-update ${hasGid ? status : 'disabled'}`}
                          onClick={() => hasGid && handleUpdate(p)}
                          disabled={!hasGid || status === 'loading'}
                          title={!hasGid ? 'GID가 없어서 업데이트할 수 없어요' : ''}
                        >
                          {!hasGid && 'GID 없음'}
                          {hasGid && status === 'idle' && '데이터 업데이트'}
                          {hasGid && status === 'loading' && '업데이트 중...'}
                          {hasGid && status === 'ok' && '완료'}
                          {hasGid && status === 'error' && '실패 (서버 확인)'}
                        </button>
                        {updateTimes[p.key] && (
                          <div className="update-time">{updateTimes[p.key]}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>이전</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                className={page === n ? 'active' : ''}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>다음</button>
          </div>
        )}
      </section>

    </div>
  )
}
