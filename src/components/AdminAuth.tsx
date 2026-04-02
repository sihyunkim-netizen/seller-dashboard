import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export default function AdminAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s && !s.user.email?.endsWith('@myrealtrip.com')) {
        supabase.auth.signOut()
        setError('myrealtrip.com 이메일만 접근할 수 있어요.')
        setSession(null)
      } else {
        setSession(s)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s && !s.user.email?.endsWith('@myrealtrip.com')) {
        supabase.auth.signOut()
        setError('myrealtrip.com 이메일만 접근할 수 있어요.')
        setSession(null)
      } else {
        setSession(s)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div style={loadingStyle}>로딩 중...</div>

  if (!session) {
    return (
      <div style={centerStyle}>
        <div style={boxStyle}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>어드민</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
            myrealtrip.com 계정으로 로그인해주세요
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          <button style={btnStyle} onClick={handleLogin}>Google로 로그인</button>
        </div>
      </div>
    )
  }

  return <>{children}</>

  async function handleLogin() {
    setError('')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/admin' },
    })
  }
}

const centerStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6',
}
const boxStyle: React.CSSProperties = {
  background: 'white', borderRadius: 16, padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
}
const btnStyle: React.CSSProperties = {
  background: '#6366f1', color: 'white', border: 'none', borderRadius: 8,
  padding: '12px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%',
}
const errorStyle: React.CSSProperties = {
  background: '#fee2e2', color: '#ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
}
const loadingStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
}
