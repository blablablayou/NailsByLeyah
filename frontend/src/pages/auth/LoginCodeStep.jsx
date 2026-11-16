import { useEffect, useState } from 'react'
import { api } from '../../api'
import { ApiError, errorMessage } from '../../api/errors'
import { Alert, Button } from '../../components/ui'

const RESEND_WAIT_SECONDS = 60

/**
 * Leyah's second step after her password: the 6-digit code from her email. "Remember this device" is ticked, so her own
 * browser skips this for 30 days; a new code can be asked for after a minute.
 */
export function LoginCodeStep({ challenge, onVerified, onBack }) {
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(null) // 'verify' | 'resend'
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS)

  useEffect(() => {
    if (wait <= 0) return undefined
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const verify = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.')
      return
    }
    setBusy('verify')
    setError(null)
    setNotice(null)
    try {
      await onVerified({ code, rememberDevice: remember })
    } catch (err) {
      // The sign-in timed out (or the password changed meanwhile): start again from the password.
      if (err instanceof ApiError && err.code === 'login_pending_expired') return onBack(err.message)
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  const resend = async () => {
    setBusy('resend')
    setError(null)
    setNotice(null)
    try {
      await api.auth.resendLoginCode()
      setNotice('A new code is on its way. The earlier one no longer works.')
      setCode('')
      setWait(RESEND_WAIT_SECONDS)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'login_pending_expired') return onBack(err.message)
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="login-head">
        <h1>Check your email</h1>
        <p className="muted">
          We sent a 6-digit code to <strong>{challenge.emailHint}</strong>. It expires in {challenge.expiresInMinutes} minutes.
        </p>
      </div>
      {notice && <Alert kind="success">{notice}</Alert>}
      <form onSubmit={verify} noValidate className="stack">
        <div className="field">
          <label className="field-label" htmlFor="login-code">6-digit code</label>
          <input id="login-code" className={error ? 'input login-code-input field-invalid' : 'input login-code-input'}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code}
            aria-invalid={Boolean(error)} aria-describedby={error ? 'login-code-error' : undefined}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} />
          {error && <div id="login-code-error" className="field-error" role="alert">{error}</div>}
        </div>
        <label className="check login-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember this device for 30 days</span>
        </label>
        <Button type="submit" loading={busy === 'verify'} disabled={busy !== null} className="btn-block">Verify</Button>
      </form>
      <div className="login-code-links">
        <button type="button" className="link-button" onClick={resend} disabled={wait > 0 || busy !== null}>
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
        <button type="button" className="link-button" onClick={() => onBack(null)} disabled={busy !== null}>Back</button>
      </div>
    </>
  )
}
