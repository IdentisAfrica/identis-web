import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  phone: string
  onNext: () => void
}

export default function OtpStep({ verificationId, phone, onNext }: Props) {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const maskedPhone = phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1***$3')

  const handleSendOtp = async () => {
    setSending(true)
    setError('')
    
    try {
      const res = await fetch(`${API_URL}/api/verify/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP')
      }
      
      setOtpSent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP')
    } finally {
      setSending(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter the 6-digit code')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch(`${API_URL}/api/verify/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, code: otp })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Invalid OTP')
      }
      
      onNext()
    } catch (err: any) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
          <span className="text-4xl">💬</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Verify Phone</h2>
        <p className="text-gray-400 mt-2">{maskedPhone}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {!otpSent ? (
        <button
          onClick={handleSendOtp}
          disabled={sending}
          className="w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send OTP to my phone'}
        </button>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-5 bg-gray-800 border border-gray-700 rounded-xl text-white text-3xl text-center tracking-[0.5em] font-mono placeholder-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              maxLength={6}
            />
          </div>

          <button
            onClick={handleVerifyOtp}
            disabled={loading || otp.length !== 6}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify OTP →'}
          </button>

          <button
            onClick={handleSendOtp}
            disabled={sending}
            className="w-full mt-3 py-3 text-purple-400 text-sm hover:text-purple-300 transition"
          >
            {sending ? 'Sending...' : 'Resend OTP'}
          </button>
        </>
      )}

      <p className="text-center text-xs text-gray-500 mt-4">
        A 6-digit code will be sent to your phone via SMS
      </p>
    </div>
  )
}
