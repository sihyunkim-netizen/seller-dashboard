import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export default function SellerAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div style={loadingStyle}>로딩 중...</div>
  if (session) return <>{children}</>

  async function handleSendOtp() {
    setError('')
    setLoading(true)
    try {
      // 등록된 셀러 이메일인지 확인
      const { data: allowed, error: rpcErr } = await supabase
        .rpc('is_allowed_seller', { check_email: email.toLowerCase().trim() })

      if (rpcErr || !allowed) {
        setError('등록되지 않은 이메일이에요. 담당자에게 문의해주세요.')
        setLoading(false)
        return
      }

      const { error: otpErr } = await supabase.auth.signInWithOtp({ email: email.toLowerCase().trim() })
      if (otpErr) throw otpErr
      setStep('otp')
    } catch {
      setError('오류가 발생했어요. 다시 시도해주세요.')
    }
    setLoading(false)
  }

  async function handleVerifyOtp() {
    setError('')
    setLoading(true)
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token: otp.trim(),
        type: 'email',
      })
      if (verifyErr) throw verifyErr
    } catch {
      setError('인증코드가 올바르지 않아요.')
    }
    setLoading(false)
  }

  return (
    <div style={centerStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>공동구매 셀러 대시보드</div>

        {step === 'email' ? (
          <>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              이메일을 입력하면 인증코드를 보내드려요
            </div>
            {error && <div style={errorStyle}>{error}</div>}
            <input
              style={inputStyle}
              type="email"
              placeholder="이메일 주소"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
            />
            <button style={btnStyle} onClick={handleSendOtp} disabled={!email || loading}>
              {loading ? '확인 중...' : '인증코드 받기'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              <strong>{email}</strong>로 발송된 6자리 코드를 입력해주세요
            </div>
            {error && <div style={errorStyle}>{error}</div>}
            <input
              style={inputStyle}
              type="text"
              placeholder="000000"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
            />
            <button style={btnStyle} onClick={handleVerifyOtp} disabled={otp.length !== 6 || loading}>
              {loading ? '확인 중...' : '입장하기'}
            </button>
            <button style={backStyle} onClick={() => { setStep('email'); setError(''); setOtp('') }}>
              이메일 다시 입력
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6',
}
const boxStyle: React.CSSProperties = {
  background: 'white', borderRadius: 16, padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  textAlign: 'center', width: 360,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none',
}
const btnStyle: React.CSSProperties = {
  background: '#6366f1', color: 'white', border: 'none', borderRadius: 8,
  padding: '12px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 8,
}
const backStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', marginTop: 4,
}
const errorStyle: React.CSSProperties = {
  background: '#fee2e2', color: '#ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12,
}
const loadingStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
}
