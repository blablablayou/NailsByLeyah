import { useState } from 'react'
import { Button } from './ui'
import { canDownloadReceipt, downloadReceipt } from '../lib/receiptPdf'

/**
 * "Download receipt (PDF)" for a payment the salon has verified. Before that the button is off and says why: a paid
 * booking waits for Leyah to check the payment.
 */
export function ReceiptDownload({ receipt, load, variant = 'primary', showHint = true }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = receipt ? canDownloadReceipt(receipt) : true
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = receipt ?? (await load())
      if (!canDownloadReceipt(data)) throw new Error('The receipt is available once the salon verifies the payment.')
      await downloadReceipt(data)
    } catch (err) {
      setError(err.message || 'The receipt could not be downloaded. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="receipt-download">
      {!ready && showHint && <span className="muted small">Available once Leyah verifies your payment.</span>}
      {error && <span className="field-error">{error}</span>}
      {/* Until Leyah verifies the payment the button is plainly unavailable (outline and a lock), not a faded pink one. */}
      <Button variant={ready ? variant : 'secondary'} className={ready ? '' : 'receipt-pdf-locked'} loading={busy} disabled={!ready} onClick={run}>
        {!ready && (
          <svg className="receipt-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
        )}
        Download receipt (PDF)
      </Button>
    </span>
  )
}
