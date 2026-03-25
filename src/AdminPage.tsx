import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Admin.css'

type Project = {
  key: string
  name: string
  startDate: string
  endDate: string
  partnerId: string
  gids: string
  createdAt: string
}

const STORAGE_KEY = 'seller_dashboard_projects'

function loadProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

function makeKey(partnerId: string, startDate: string, endDate: string) {
  return `${partnerId}_${startDate}_${endDate}`
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', partnerId: '', gids: '' })
  const [updateStatus, setUpdateStatus] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const { name, startDate, endDate, partnerId, gids } = form
    if (!name || !startDate || !endDate || !partnerId || !gids) return

    const key = makeKey(partnerId, startDate, endDate)
    const newProject: Project = {
      key,
      name,
      startDate,
      endDate,
      partnerId,
      gids,
      createdAt: new Date().toISOString(),
    }

    const updated = [newProject, ...projects.filter(p => p.key !== key)]
    setProjects(updated)
    saveProjects(updated)
    setForm({ name: '', startDate: '', endDate: '', partnerId: '', gids: '' })
  }

  function handleDelete(key: string) {
    const updated = projects.filter(p => p.key !== key)
    setProjects(updated)
    saveProjects(updated)
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
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setUpdateStatus(s => ({ ...s, [project.key]: 'ok' }))
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
        <h1>어드민</h1>
        <p className="admin-sub">셀러 프로젝트를 관리하고 데이터를 업데이트해요</p>
      </header>

      {/* 프로젝트 추가 폼 */}
      <section className="admin-form-section">
        <h2>+ 새 프로젝트 추가</h2>
        <form className="admin-form" onSubmit={handleAdd}>
          <div className="form-row">
            <label>프로젝트명</label>
            <input
              type="text"
              placeholder="예: 씨마크 3월 공동구매"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-row two-col">
            <div>
              <label>시작일</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label>종료일</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-row two-col">
            <div>
              <label>파트너 ID</label>
              <input
                type="text"
                placeholder="예: 147150"
                value={form.partnerId}
                onChange={e => setForm(f => ({ ...f, partnerId: e.target.value }))}
                required
              />
            </div>
            <div>
              <label>GID 목록</label>
              <input
                type="text"
                placeholder="예: 2680698,2705226"
                value={form.gids}
                onChange={e => setForm(f => ({ ...f, gids: e.target.value }))}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-primary">저장</button>
        </form>
      </section>

      {/* 프로젝트 목록 */}
      <section className="admin-list-section">
        <h2>셀러 프로젝트 목록</h2>
        {projects.length === 0 && (
          <p className="admin-empty">아직 추가된 프로젝트가 없어요.</p>
        )}
        <div className="project-list">
          {projects.map(p => {
            const status = updateStatus[p.key] || 'idle'
            return (
              <div key={p.key} className="project-card">
                <div className="project-info">
                  <div className="project-name">{p.name}</div>
                  <div className="project-meta">
                    {p.startDate} ~ {p.endDate} · 파트너ID: {p.partnerId} · GID: {p.gids}
                  </div>
                </div>
                <div className="project-actions">
                  <button
                    className={`btn-update ${status}`}
                    onClick={() => handleUpdate(p)}
                    disabled={status === 'loading'}
                  >
                    {status === 'idle' && '데이터 업데이트'}
                    {status === 'loading' && '업데이트 중...'}
                    {status === 'ok' && '완료'}
                    {status === 'error' && '실패 (서버 확인)'}
                  </button>
                  <button
                    className="btn-dashboard"
                    onClick={() => navigate(`/?key=${p.key}`)}
                  >
                    대시보드
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(p.key)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 서버 안내 */}
      <div className="admin-notice">
        데이터 업데이트 버튼은 VPN 연결 상태에서 <code>node scripts/server.cjs</code> 서버가 실행 중이어야 해요.
      </div>
    </div>
  )
}
