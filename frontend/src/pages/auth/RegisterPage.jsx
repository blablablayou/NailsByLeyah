import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api'
import { NameField, PasswordField, PasswordRules, PhoneField, UsernameField } from '../../components/FormFields'
import { LegalDocumentModal } from '../../components/Modal'
import { Alert, Button, Card, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../api/errors'
import { hasErrors, validatePhone, validateRegistration } from '../../validation/rules'

const empty = { firstName: '', lastName: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '' }

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  // The Terms & Conditions or the Privacy Policy, opened from the line under Create account (to read; no ticking).
  const [legalDocument, setLegalDocument] = useState(null)

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    // Creating the account is the agreement ("By creating an account, you agree to…"); the backend records the Terms version.
    const request = { ...values, acceptTerms: true }
    const found = validateRegistration(request)
    if (usernameAvailable === false) found.username = 'Username is already taken.'
    setErrors(found)
    setFailure(null)
    if (hasErrors(found)) return

    setSubmitting(true)
    try {
      await api.auth.register(request)
      navigate(`/verify-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`, { state: { registered: true } })
    } catch (err) {
      setErrors(fieldErrors(err))
      setFailure(Object.keys(fieldErrors(err)).length ? null : errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      {/* The same photo-and-form card as Log in. */}
      <div className="login-split register-split">
      <aside className="login-art" aria-hidden="true">
        <img src="/img/service-plain.jpg" alt="" width="640" height="640" />
        <div className="login-art-text">
          <p className="login-art-name">Join Nails by Leyah</p>
          <p>Save your details once, then book any time and keep your visits in one place.</p>
        </div>
      </aside>
      <Card className="auth-card auth-card-wide login-card">
        <div className="login-head">
          <h1>Create your account</h1>
          <p className="muted">Book appointments and keep track of your visits.</p>
        </div>
        {failure && <Alert kind="error">{failure}</Alert>}

        <form onSubmit={submit} noValidate className="stack">
          <div className="grid-2">
            <NameField label="First Name" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} />
            <NameField label="Last Name" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} />
          </div>
          <div className="grid-2">
            <UsernameField value={values.username} onChange={set('username')} error={errors.username} onAvailabilityChange={setUsernameAvailable} />
            <PhoneField value={values.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber}
              onBlur={() => values.phoneNumber && setErrors((e) => ({ ...e, phoneNumber: validatePhone(values.phoneNumber) ?? undefined }))} />
          </div>
          <TextField label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} required
            error={errors.email} onChange={(e) => set('email')(e.target.value)} />
          <div className="grid-2">
            <PasswordField value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
            <PasswordField label="Confirm Password" value={values.confirmPassword} onChange={set('confirmPassword')}
              error={errors.confirmPassword} autoComplete="new-password" />
          </div>
          {/* The password rules span both columns so they stay readable. */}
          <PasswordRules password={values.password} />

          <Button type="submit" loading={submitting} className="btn-block">Create account</Button>
          {/* Agreement by continuing, as on Amazon: no checkbox (chosen 2026-11-15 over requirement 1.8's checkbox). */}
          <p className="su-agree" id="su-agree">
            By creating an account, you agree to Nails by Leyah&rsquo;s{' '}
            <button type="button" className="su-agree-link" onClick={() => setLegalDocument('terms')}>Terms &amp; Conditions</button>
            {' '}and{' '}
            <button type="button" className="su-agree-link" onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>.
          </p>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </Card>
      </div>

      {legalDocument && <LegalDocumentModal document={legalDocument} onClose={() => setLegalDocument(null)} />}
    </div>
  )
}
