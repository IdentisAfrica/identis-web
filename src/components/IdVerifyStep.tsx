import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  onNext: () => void
}

type IdType = 'bvn' | 'nin' | 'sim-age'

export default function IdVerifyStep({ verificationId, onNext }: Props) {
  const [idType, setIdType] = useState<IdType | null>(null)
  const [idNumber, setIdNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const idOptions = [
    {
      type: 'bvn' as IdType,
      title: 'BVN',
      subtitle: 'Bank Verification Number',
      maxScore: 100,
      trustLevel: 'FULLY TRUSTED',
      color: 'emerald',
      icon: '🏦',
      description: 'Highest assurance • CBN verified'
    },
    {
      type: 'nin' as IdType,
      title: 'NIN',
      subtitle: 'National ID Number',
      maxScore: 75,
      trustLevel: 'MODERATELY TRUSTED',
      color: 'blue',
      icon: '🪪',
      description: 'Government-issued ID'
    },
    {
      type: 'sim-age' as IdType,
      title: 'SIM Age',
      subtitle: 'Phone Number Tenure',
      maxScore: 65,
      trustLevel: 'LIMITED TRUST',
      color: 'amber',
      icon: '📱',
      description: 'Requires 12+ months'
    }
  ]

  const handleVerify = async () => {
    if (!idType) return
    setError('')
    setLoading(true)

    try {
      const endpoint = idType === 'sim-age' 
        ? `${API_URL}/api/id/sim-age`
        : `${API_URL}/api/id/${idType}`

      const body = idType === 'sim-age'
        ? { verificationId }
        : { verificationId, [`${idType}Number`]: idNumber }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (data.success) {
        onNext()
      } else {
        setError(data.message || 'Verification failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedOption = idOptions.find(o => o.type === idType)

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
          <span className="text-4xl">🪪</span>
        </div>
        <h2 className="text-2xl font-bold text-white">ID Verification</h2>
        <p className="text-gray-400 mt-2">Choose your verification method</p>
      </div>

      {/* ID Type Selection */}
      {!idType && (
        <div className="space-y-3">
          {idOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => setIdType(option.type)}
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded-2xl hover:border-gray-600 transition text-left group"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  option.color === 'emerald' ? 'bg-emerald-500/20' :
                  option.color === 'blue' ? 'bg-blue-500/20' :
                  'bg-amber-500/20'
                }`}>
                  {option.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-white text-lg">{option.title}</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      option.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                      option.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {option.maxScore} pts
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{option.subtitle}</p>
                  <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                </div>
                <div className="text-gray-600 group-hover:text-gray-400 transition">
                  →
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ID Input Form */}
      {idType && idType !== 'sim-age' && (
        <div>
          <button
            onClick={() => { setIdType(null); setIdNumber(''); setError(''); }}
            className="text-gray-400 text-sm mb-6 hover:text-white transition flex items-center gap-1"
          >
            ← Choose different method
          </button>

          <div className="bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                selectedOption?.color === 'emerald' ? 'bg-emerald-500/20' : 'bg-blue-500/20'
              }`}>
                {selectedOption?.icon}
              </div>
              <div>
                <p className="font-bold text-white">{selectedOption?.title}</p>
                <p className="text-sm text-gray-400">{selectedOption?.trustLevel}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Enter your {idType.toUpperCase()}
            </label>
            <input
              type="text"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="12345678901"
              className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-white text-xl tracking-wider font-mono placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              maxLength={11}
            />
            <p className="text-xs text-gray-500 mt-2">11 digits required</p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || idNumber.length !== 11}
            className={`w-full py-4 text-white rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg ${
              selectedOption?.color === 'emerald' 
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/20'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/20'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Verifying...
              </span>
            ) : (
              `Verify ${idType.toUpperCase()} →`
            )}
          </button>
        </div>
      )}

      {/* SIM Age Check */}
      {idType === 'sim-age' && (
        <div>
          <button
            onClick={() => { setIdType(null); setError(''); }}
            className="text-gray-400 text-sm mb-6 hover:text-white transition flex items-center gap-1"
          >
            ← Choose different method
          </button>

          <div className="bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-amber-500/20">
                📱
              </div>
              <div>
                <p className="font-bold text-white">SIM Age Check</p>
                <p className="text-sm text-gray-400">LIMITED TRUST</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
            <p className="text-amber-400 text-sm">
              <strong>Note:</strong> Your SIM must be at least 12 months old to pass this verification.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-semibold text-lg hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Checking...
              </span>
            ) : (
              'Check SIM Age →'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
