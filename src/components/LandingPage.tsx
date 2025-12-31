import { useState, useEffect } from 'react'

interface Props {
  onStartVerification: () => void
}

export default function LandingPage({ onStartVerification }: Props) {
  const [verifiedCount, setVerifiedCount] = useState(12847)

  useEffect(() => {
    const interval = setInterval(() => {
      setVerifiedCount(prev => prev + Math.floor(Math.random() * 3))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-white">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[20%] right-[10%] w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] left-[5%] w-80 h-80 bg-emerald-500/10 rounded-full blur-[80px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-lg">ID</span>
          </div>
          <span className="text-2xl font-black">IDENTIS</span>
        </div>
        <button
          onClick={onStartVerification}
          className="px-6 py-3 bg-white text-gray-900 rounded-full font-semibold hover:bg-gray-100 transition"
        >
          Get Verified
        </button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-8">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-sm">{verifiedCount.toLocaleString()} traders verified</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
              Trust is
              <span className="block bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                Everything
              </span>
              <span className="block text-3xl text-gray-400 font-medium mt-4">in P2P Trading</span>
            </h1>

            <p className="text-xl text-gray-400 mb-8 max-w-lg">
              Verify anyone in <span className="text-white font-semibold">under 60 seconds</span>. 
              Share a trust certificate before every trade.
              <span className="text-emerald-400 font-semibold"> Zero scams.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <button
                onClick={onStartVerification}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl font-bold text-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-xl shadow-blue-500/25"
              >
                Verify Now — ₦2,500 →
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {['😊', '👨🏿', '👩🏽', '👨🏻'].map((e, i) => (
                  <div key={i} className="w-8 h-8 bg-gray-800 rounded-full border-2 border-gray-900 flex items-center justify-center">
                    {e}
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-500">Trusted by 10,000+ traders</div>
            </div>
          </div>

          {/* Certificate Preview */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-2xl opacity-20" />
            <div className="relative bg-gray-900 rounded-3xl p-8 border border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xs">ID</span>
                  </div>
                  <span className="font-bold">IDENTIS Certificate</span>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">✓ Verified</span>
              </div>

              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 mb-4">
                  <span className="text-4xl font-black">95</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">FULLY TRUSTED</p>
                <p className="text-gray-500 text-sm mt-1">BVN Verified</p>
              </div>

              <div className="space-y-2">
                {['Phone Verified', 'Face Verified', 'BVN Verified'].map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-gray-800/50 rounded-xl">
                    <span>{item}</span>
                    <span className="text-emerald-400">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 border-y border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '50,000+', label: 'Verifications' },
            { value: '<60s', label: 'Avg. Time' },
            { value: '99.9%', label: 'Accuracy' },
            { value: '₦0', label: 'Fraud Losses' },
          ].map((stat, i) => (
            <div key={i}>
              <p className="text-3xl font-black">{stat.value}</p>
              <p className="text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="relative z-10 py-24 max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-black text-center mb-16">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: '01', title: 'Enter Phone', desc: 'We send a quick OTP to verify', icon: '📱' },
            { step: '02', title: 'Face Check', desc: 'Quick liveness detection', icon: '🔐' },
            { step: '03', title: 'ID Verify', desc: 'BVN, NIN, or SIM Age check', icon: '✓' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-800/50 rounded-3xl p-8">
              <div className="text-5xl mb-4">{item.icon}</div>
              <div className="text-sm text-gray-500 mb-2">STEP {item.step}</div>
              <h3 className="text-xl font-bold mb-2">{item.title}</h3>
              <p className="text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Levels */}
      <section className="relative z-10 py-24 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-black text-center mb-16">Trust Levels</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { level: 'FULLY TRUSTED', method: 'BVN', score: '100', color: 'emerald', rec: true },
              { level: 'MODERATELY TRUSTED', method: 'NIN', score: '75', color: 'blue', rec: false },
              { level: 'LIMITED TRUST', method: 'SIM Age', score: '65', color: 'amber', rec: false },
            ].map((tier, i) => (
              <div key={i} className={`bg-gray-800 rounded-3xl p-8 ${tier.rec ? 'ring-2 ring-emerald-500' : ''}`}>
                {tier.rec && <div className="text-emerald-400 text-sm font-bold mb-4">RECOMMENDED</div>}
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
                  tier.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                  tier.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {tier.level}
                </div>
                <h3 className="text-xl font-bold mb-2">{tier.method} Verification</h3>
                <div className="text-4xl font-black mb-4">{tier.score}<span className="text-lg text-gray-500">/100</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 py-24 max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-black mb-4">Simple Pricing</h2>
        <p className="text-gray-400 mb-12">One verification. One price.</p>
        <div className="bg-gray-800 rounded-3xl p-12 border border-gray-700">
          <div className="text-6xl font-black mb-4">₦2,500</div>
          <p className="text-gray-400 mb-8">per verification • valid for 1 hour</p>
          <button
            onClick={onStartVerification}
            className="px-12 py-5 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl font-bold text-xl"
          >
            Get Verified Now →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">ID</span>
            </div>
            <span className="font-bold">IDENTIS</span>
          </div>
          <p className="text-gray-500 text-sm">© 2025 IDENTIS. Made in Nigeria 🇳🇬</p>
        </div>
      </footer>
    </div>
  )
}
