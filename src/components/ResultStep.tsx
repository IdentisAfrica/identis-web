import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

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
  expiresAt?: string
}

export default function ResultStep({ verificationId }: Props) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showShareOptions, setShowShareOptions] = useState(false)

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

  const getCertificateUrl = () => {
    if (result?.certificateId) {
      return `${window.location.origin}/certificate/${result.certificateId}`
    }
    return ''
  }

  const copyToClipboard = async () => {
    const url = getCertificateUrl()
    if (url) {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const shareViaWhatsApp = () => {
    const url = getCertificateUrl()
    const text = `I've been verified on IDENTIS with a trust score of ${result?.trustScore}. View my certificate: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareViaTelegram = () => {
    const url = getCertificateUrl()
    const text = `I've been verified on IDENTIS with a trust score of ${result?.trustScore}. View my certificate:`
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareViaSMS = () => {
    const url = getCertificateUrl()
    const text = `IDENTIS Verification: Trust Score ${result?.trustScore}. Certificate: ${url}`
    window.open(`sms:?body=${encodeURIComponent(text)}`, '_blank')
  }

  const openCertificate = () => {
    const url = getCertificateUrl()
    if (url) {
      window.open(url, '_blank')
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
        <p className="text-gray-400 text-sm mt-1">Your identity has been verified</p>
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
      <div className="bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm">Certificate ID</span>
          <span className="text-emerald-400 text-sm font-medium">✓ Valid</span>
        </div>
        <p className="font-mono text-lg text-white mb-2">{result?.certificateId}</p>
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Expires in 1 hour — Share now!</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={openCertificate}
          className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition border border-gray-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View
        </button>
        <button
          onClick={copyToClipboard}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition border ${
            copied 
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
              : 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>

      {/* Main Share Button */}
      <button
        onClick={() => setShowShareOptions(!showShareOptions)}
        className="w-full py-4 rounded-xl font-semibold text-lg transition-all shadow-lg flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:from-blue-600 hover:to-emerald-600 shadow-blue-500/20 mb-3"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share Certificate
        <svg className={`w-4 h-4 transition-transform ${showShareOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Share Options */}
      {showShareOptions && (
        <div className="bg-gray-800 rounded-xl p-3 mb-4 border border-gray-700 space-y-2">
          <button
            onClick={shareViaWhatsApp}
            className="w-full flex items-center gap-3 px-4 py-3 bg-[#25D366]/20 hover:bg-[#25D366]/30 rounded-lg text-[#25D366] transition"
          >
            <span className="text-xl">💬</span>
            <span className="font-medium">Share via WhatsApp</span>
          </button>
          <button
            onClick={shareViaTelegram}
            className="w-full flex items-center gap-3 px-4 py-3 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 rounded-lg text-[#0088cc] transition"
          >
            <span className="text-xl">✈️</span>
            <span className="font-medium">Share via Telegram</span>
          </button>
          <button
            onClick={shareViaSMS}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-gray-300 transition"
          >
            <span className="text-xl">💬</span>
            <span className="font-medium">Share via SMS</span>
          </button>
        </div>
      )}

      {/* How to use section */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
        <p className="text-blue-400 font-semibold text-sm mb-2">💡 How to use your certificate</p>
        <ol className="text-gray-400 text-sm space-y-1">
          <li>1. Share the link with your trading partner</li>
          <li>2. They click to see your verified identity</li>
          <li>3. Trade with confidence!</li>
        </ol>
      </div>

      {/* Verification Method */}
      <div className="flex items-center justify-between py-3 border-t border-gray-800">
        <span className="text-gray-400 text-sm">Verification Method</span>
        <span className="font-medium text-white">{result?.idType || 'N/A'}</span>
      </div>

      {/* Checks Completed */}
      <div className="py-3 border-t border-gray-800">
        <p className="text-gray-400 text-sm mb-2">Checks Completed</p>
        <div className="flex gap-2 flex-wrap">
          {['Phone', 'Liveness', result?.idType].filter(Boolean).map((check, i) => (
            <span key={i} className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
              ✓ {check}
            </span>
          ))}
        </div>
      </div>

      {/* Start New */}
      <button
        onClick={() => window.location.href = '/'}
        className="w-full mt-4 py-3 text-gray-400 text-sm hover:text-white transition"
      >
        ← Back to Home
      </button>
    </div>
  )
}
