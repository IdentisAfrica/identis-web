import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Certificate {
  certificateId: string
  phone: string
  trustScore: number
  trustLevel: string
  trustDescription: string
  idType: string
  verifiedAt: string
  expiresAt: string
  checks: {
    phone: boolean
    liveness: boolean
    bvn: boolean
    nin: boolean
    simAge: boolean
  }
}

export default function CertificateView() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCertificate()
  }, [id])

  const fetchCertificate = async () => {
    try {
      const res = await fetch(`${API_URL}/api/verify/certificate/${id}`)
      const data = await res.json()

      if (res.ok) {
        setCertificate(data)
      } else {
        setError(data.error || 'Certificate not found')
      }
    } catch (err) {
      setError('Failed to load certificate')
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

  const isExpired = certificate?.expiresAt ? new Date(certificate.expiresAt) < new Date() : false

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-3xl border border-gray-800 p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <span className="text-4xl">❌</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Invalid Certificate</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-block px-8 py-3 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-700 transition"
          >
            Go to IDENTIS
          </Link>
        </div>
      </div>
    )
  }

  const color = getTrustColor(certificate?.trustLevel || '')

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-4">
      <div className="max-w-md mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">ID</span>
            </div>
            <span className="text-xl font-bold text-white">IDENTIS</span>
          </div>
          <p className="text-gray-400">Identity Verification Certificate</p>
        </div>

        {/* Certificate Card */}
        <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
          {/* Status Badge */}
          {isExpired ? (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 text-center">
              <span className="text-red-400 font-bold">⚠️ CERTIFICATE EXPIRED</span>
            </div>
          ) : (
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-4 mb-6 text-center">
              <span className="text-emerald-400 font-bold">✓ VERIFIED IDENTITY</span>
            </div>
          )}

          {/* Trust Score */}
          <div className={`relative rounded-2xl p-6 text-center border mb-6 ${
            color === 'emerald' ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-emerald-500/30' :
            color === 'blue' ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30' :
            color === 'amber' ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 border-amber-500/30' :
            'bg-gray-800 border-gray-700'
          }`}>
            <p className="text-gray-400 text-sm mb-1">Trust Score</p>
            <div className={`text-6xl font-black mb-2 ${
              color === 'emerald' ? 'text-emerald-400' :
              color === 'blue' ? 'text-blue-400' :
              color === 'amber' ? 'text-amber-400' :
              'text-gray-400'
            }`}>
              {certificate?.trustScore}
            </div>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
              color === 'emerald' ? 'bg-emerald-500/30 text-emerald-300' :
              color === 'blue' ? 'bg-blue-500/30 text-blue-300' :
              color === 'amber' ? 'bg-amber-500/30 text-amber-300' :
              'bg-gray-700 text-gray-300'
            }`}>
              {certificate?.trustDescription}
            </span>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">Phone</span>
              <span className="text-white font-mono">{certificate?.phone}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">ID Type</span>
              <span className="text-white">{certificate?.idType || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">Verified At</span>
              <span className="text-white text-sm">
                {certificate?.verifiedAt ? new Date(certificate.verifiedAt).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-gray-400">Expires At</span>
              <span className={`text-sm ${isExpired ? 'text-red-400' : 'text-white'}`}>
                {certificate?.expiresAt ? new Date(certificate.expiresAt).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>

          {/* Checks */}
          <div className="mb-6">
            <p className="text-gray-400 text-sm mb-3">Verification Checks</p>
            <div className="flex flex-wrap gap-2">
              {certificate?.checks.phone && (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ Phone</span>
              )}
              {certificate?.checks.liveness && (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ Liveness</span>
              )}
              {certificate?.checks.bvn && (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ BVN</span>
              )}
              {certificate?.checks.nin && (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ NIN</span>
              )}
              {certificate?.checks.simAge && (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ SIM Age</span>
              )}
            </div>
          </div>

          {/* Certificate ID */}
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-gray-500 text-xs mb-1">Certificate ID</p>
            <p className="font-mono text-white">{certificate?.certificateId}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-blue-400 hover:text-blue-300 transition text-sm"
          >
            Get your own verification →
          </Link>
        </div>
      </div>
    </div>
  )
}
