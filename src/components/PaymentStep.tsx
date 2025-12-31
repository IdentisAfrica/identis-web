import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Props {
  verificationId: string
  onNext: () => void
  onBack: () => void
}

export default function PaymentStep({ verificationId, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSkipPayment = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/api/payment/demo-skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId })
      })

      const data = await res.json()

      if (data.success) {
        onNext()
      } else {
        setError(data.error || 'Failed to process')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <span className="text-4xl">💳</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Payment</h2>
        <p className="text-gray-400 mt-2">Complete payment to continue</p>
      </div>

      {/* Price Card */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-lg opacity-20" />
        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-400 text-sm">Verification Fee</p>
              <p className="text-4xl font-black text-white">₦2,500</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">Valid for</p>
              <p className="text-xl font-bold text-white">1 Hour</p>
            </div>
          </div>
        </div>
      </div>

      {/* What's Included */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-400 mb-3">What's included:</p>
        <div className="space-y-2">
          {[
            { icon: '📱', text: 'Phone OTP Verification' },
            { icon: '🔐', text: 'AI Liveness Detection' },
            { icon: '🏦', text: 'BVN / NIN / SIM Age Check' },
            { icon: '📜', text: 'Shareable Trust Certificate' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-800/50 rounded-xl">
              <span className="text-xl">{item.icon}</span>
              <span className="text-gray-300">{item.text}</span>
              <span className="ml-auto text-emerald-400">✓</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSkipPayment}
        disabled={loading}
        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-semibold text-lg hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 mb-3"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          'Continue (Demo) →'
        )}
      </button>

      <p className="text-center text-xs text-gray-500 mb-4">
        Demo mode: Payment skipped for testing
      </p>

      <button
        onClick={onBack}
        className="w-full py-3 text-gray-400 text-sm hover:text-white transition"
      >
        ← Back
      </button>
    </div>
  )
}
