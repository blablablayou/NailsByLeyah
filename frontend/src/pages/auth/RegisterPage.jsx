import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api'
import { NameField, PasswordField, PasswordRules, PhoneField, UsernameField } from '../../components/FormFields'
import { LegalDocumentModal } from '../../components/Modal'
import { Alert, Button, Card, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../api/errors'
import {
  hasErrors, validateConfirmPassword, validateEmail, validateName, validatePassword, validatePhone, validateRegistration, validateUsername,
} from '../../validation/rules'

const empty = { firstName: '', lastName: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '' }

/** Each field's own check, the same rules Create account uses. */
const FIELD_RULES = {
  firstName: (v) => validateName(v.firstName, 'First Name'),
  lastName: (v) => validateName(v.lastName, 'Last Name'),
  username: (v) => validateUsername(v.username),
  email: (v) => validateEmail(v.email),
  phoneNumber: (v) => validatePhone(v.phoneNumber),
  password: (v) => validatePassword(v.password),
  confirmPassword: (v) => validateConfirmPassword(v.password, v.confirmPassword),
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  // The Terms & Conditions or the Privacy Policy, opened from the line under Create account (to read; no ticking).
  const [legalDocument, setLegalDocument] = useState(null)

  // A field is checked when the user leaves it (an empty one only on Create account, so tabbing past isn't nagged).
  // Once it shows a warning, it is checked again as they type, so the warning goes away the moment it's right.
  const check = (field, next = values) => {
    const rule = FIELD_RULES[field]
    if (rule && next[field]) setErrors((e) => ({ ...e, [field]: rule(next) ?? undefined }))
  }
  const blur = (field) => () => check(field)

  const set = (field) => (value) => {
    const next = { ...values, [field]: value }
    setValues(next)
    if (errors[field]) {
      if (value) check(field, next)
      else setErrors((e) => ({ ...e, [field]: undefined }))
    }
    // The confirmation follows the password: a fixed password can make a mismatch warning wrong.
    if (field === 'password' && errors.confirmPassword) check('confirmPassword', next)
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
            <NameField label="First Name" autoComplete="given-name" value={values.firstName} onChange={set('firstName')}
              onBlur={blur('firstName')} error={errors.firstName} />
            <NameField label="Last Name" autoComplete="family-name" value={values.lastName} onChange={set('lastName')}
              onBlur={blur('lastName')} error={errors.lastName} />
          </div>
          <div className="grid-2">
            <UsernameField value={values.username} onChange={set('username')} onBlur={blur('username')} error={errors.username}
              onAvailabilityChange={setUsernameAvailable} />
            <PhoneField value={values.phoneNumber} onChange={set('phoneNumber')} onBlur={blur('phoneNumber')} error={errors.phoneNumber} />
          </div>
          <TextField label="Email address" type="email" autoComplete="email" value={values.email} required
            error={errors.email} onChange={(e) => set('email')(e.target.value)} onBlur={blur('email')} />
          <div className="grid-2">
            {/* The password's rules show live underneath, so only the confirmation warns on leaving it. */}
            <PasswordField value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
            <PasswordField label="Confirm Password" value={values.confirmPassword} onChange={set('confirmPassword')}
              onBlur={blur('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />
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
