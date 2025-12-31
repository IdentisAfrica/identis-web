import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Props {
  verificationId: string
}

interface Result {
  trustScore: number
  trustLevel: string
  trustDescription: string
  certificateId: string
  certificateUrl: string
  idType: string
}

export default function ResultStep({ verificationId }: Props) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    completeVerification()
  }, [])

  const completeVerification = async () => {
    try {
      const res = await fetch(`${API_URL}/api/verify/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId })
      })

      const data = await res.json()

      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || 'Failed to complete verification')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getTrustColor = (level: string) => {
    switch (level) {
      case 'FULLY_TRUSTED': return 'emerald'
      case 'MODERATELY_TRUSTED': return 'blue'
      case 'LIMITED_TRUST': return 'amber'
      default: return 'gray'
    }
  }

  const copyToClipboard = () => {
    if (result?.certificateId) {
      const url = `${window.location.origin}/certificate/${result.certificateId}`
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
        <div className="py-16 text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Calculating trust score...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <span className="text-4xl">❌</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Verification Failed</h2>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-8 py-3 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const color = getTrustColor(result?.trustLevel || '')

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      {/* Success Header */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white">Verification Complete!</h2>
      </div>

      {/* Trust Score Card */}
      <div className="relative mb-6">
        <div className={`absolute inset-0 rounded-2xl blur-xl opacity-30 ${
          color === 'emerald' ? 'bg-emerald-500' :
          color === 'blue' ? 'bg-blue-500' :
          'bg-amber-500'
        }`} />
        <div className={`relative rounded-2xl p-8 text-center border ${
          color === 'emerald' ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-emerald-500/30' :
          color === 'blue' ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30' :
          'bg-gradient-to-br from-amber-500/20 to-amber-600/20 border-amber-500/30'
        }`}>
          <p className="text-gray-400 text-sm mb-2">Trust Score</p>
          <div className={`text-7xl font-black mb-2 ${
            color === 'emerald' ? 'text-emerald-400' :
            color === 'blue' ? 'text-blue-400' :
            'text-amber-400'
          }`}>
            {result?.trustScore}
          </div>
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
            color === 'emerald' ? 'bg-emerald-500/30 text-emerald-300' :
            color === 'blue' ? 'bg-blue-500/30 text-blue-300' :
            'bg-amber-500/30 text-amber-300'
          }`}>
            {result?.trustDescription}
          </span>
        </div>
      </div>

      {/* Certificate Info */}
      <div className="bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm">Certificate ID</span>
          <span className="text-emerald-400 text-sm">✓ Valid</span>
        </div>
        <p className="font-mono text-lg text-white">{result?.certificateId}</p>
        <p className="text-xs text-gray-500 mt-2">Expires in 1 hour</p>
      </div>

      {/* Verification Method */}
      <div className="flex items-center justify-between py-4 border-b border-gray-800">
        <span className="text-gray-400">Verification Method</span>
        <span className="font-semibold text-white">{result?.idType || 'N/A'}</span>
      </div>

      {/* Checks Completed */}
      <div className="py-4 mb-6">
        <p className="text-gray-400 text-sm mb-3">Checks Completed</p>
        <div className="flex gap-2 flex-wrap">
          {['Phone', 'Liveness', result?.idType].filter(Boolean).map((check, i) => (
            <span key={i} className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
              ✓ {check}
            </span>
          ))}
        </div>
      </div>

      {/* Share Button */}
      <button
        onClick={copyToClipboard}
        className={`w-full py-4 rounded-xl font-semibold text-lg transition-all shadow-lg flex items-center justify-center gap-2 ${
          copied 
            ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
            : 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:from-blue-600 hover:to-emerald-600 shadow-blue-500/20'
        }`}
      >
        {copied ? (
          <>✓ Link Copied!</>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Certificate
          </>
        )}
      </button>

      {/* Start New */}
      <button
        onClick={() => window.location.href = '/'}
        className="w-full mt-3 py-3 text-gray-400 text-sm hover:text-white transition"
      >
        ← Back to Home
      </button>
    </div>
  )
}
