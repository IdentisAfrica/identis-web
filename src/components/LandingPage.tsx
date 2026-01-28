import { useEffect } from 'react'

interface Props {
  onStartVerification: () => void
}

// Simple analytics tracker
const trackEvent = (event: string) => {
  if (typeof window !== 'undefined') {
    // Store in localStorage for now, replace with real analytics later
    const events = JSON.parse(localStorage.getItem('identis_events') || '[]')
    events.push({ event, timestamp: new Date().toISOString() })
    localStorage.setItem('identis_events', JSON.stringify(events))
    console.log('📊 Event:', event)
  }
}

export default function LandingPage({ onStartVerification }: Props) {
  useEffect(() => {
    trackEvent('page_view')
  }, [])

  const handleGetVerified = () => {
    trackEvent('click_get_verified')
    onStartVerification()
  }

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[20%] right-[10%] w-96 h-96 bg-navy-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] left-[5%] w-80 h-80 bg-navy-400/10 rounded-full blur-[80px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/identis-logo.png" alt="IDENTIS" className="h-20 w-auto" />
        </div>
        <button
          onClick={handleGetVerified}
          className="px-6 py-3 bg-white text-navy-900 rounded-full font-semibold hover:bg-navy-50 transition"
        >
          Get Verified
        </button>
      </nav>

      {/* Urgency Banner */}
      <div className="relative z-10 bg-red-500/10 border-y border-red-500/20 py-3">
        <p className="text-center text-red-400 font-semibold">
          ⚠️ Nigerian P2P traders lost over ₦2.3 Billion to scams in 2025. Don't be next.
        </p>
      </div>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
              Trust is
              <span className="block text-navy-400">Everything</span>
              <span className="block text-3xl text-navy-300/70 font-medium mt-4">in P2P Trading</span>
            </h1>

            <p className="text-xl text-navy-300/70 mb-4 max-w-lg">
              Verify anyone in <span className="text-white font-semibold">under 60 seconds</span>. 
              Share a trust certificate before every trade.
              <span className="text-emerald-400 font-semibold"> Zero scams.</span>
            </p>

            <p className="text-lg text-emerald-400 font-semibold mb-8">
              🔒 Get Verified and Trade Safe
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <button
                onClick={handleGetVerified}
                className="px-8 py-4 bg-gradient-to-b from-navy-600 to-navy-700 hover:from-navy-700 hover:to-navy-800 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-navy-900/50"
              >
                Get Verified Now →
              </button>
            </div>
          </div>

          {/* Certificate Preview */}
          <div className="relative">
            <div className="absolute inset-0 bg-navy-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-navy-900 rounded-3xl p-8 border border-navy-800">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <img src="/apple-touch-icon.png" alt="IDENTIS" className="w-8 h-8 rounded-lg" />
                  <span className="font-bold">IDENTIS Certificate</span>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-semibold">
                  ✓ Verified
                </span>
              </div>

              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 mb-4">
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-emerald-400">Fully Verified</p>
                <p className="text-navy-400 text-sm mt-1">BVN Verified</p>
              </div>

              <div className="space-y-2">
                {['Phone Verified', 'Face Verified', 'BVN Verified'].map((check, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-navy-800/50 rounded-xl">
                    <span>{check}</span>
                    <span className="text-emerald-400">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative z-10 border-y border-navy-800 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '<60s', label: 'Verification Time' },
            { value: '99.9%', label: 'Accuracy' },
            { value: 'BVN', label: 'Verified Identity' },
            { value: '₦0', label: 'Fraud Losses' },
          ].map((stat, i) => (
            <div key={i}>
              <p className="text-3xl font-black">{stat.value}</p>
              <p className="text-navy-400">{stat.label}</p>
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
            <div key={i} className="bg-navy-900/50 border border-navy-800 rounded-3xl p-8">
              <div className="text-5xl mb-4">{item.icon}</div>
              <div className="text-sm text-navy-400 mb-2">STEP {item.step}</div>
              <h3 className="text-xl font-bold mb-2">{item.title}</h3>
              <p className="text-navy-300/70">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Levels */}
      <section className="relative z-10 py-24 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-black text-center mb-16">Trust Levels</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { level: 'FULLY TRUSTED', method: 'BVN', score: '100', color: 'emerald', rec: true },
              { level: 'MODERATELY TRUSTED', method: 'NIN', score: '75', color: 'navy', rec: false },
              { level: 'LIMITED TRUST', method: 'SIM Age', score: '65', color: 'amber', rec: false },
            ].map((item, i) => (
              <div key={i} className={`bg-navy-900 border border-navy-800 rounded-3xl p-8 ${item.rec ? 'ring-2 ring-emerald-500' : ''}`}>
                {item.rec && <div className="text-emerald-400 text-sm font-bold mb-4">RECOMMENDED</div>}
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
                  item.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                  item.color === 'navy' ? 'bg-navy-500/20 text-navy-300' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {item.level}
                </div>
                <h3 className="text-xl font-bold mb-2">{item.method} Verification</h3>
                <div className="text-4xl font-black mb-4 font-mono">
                  {item.score}<span className="text-lg text-navy-500">/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 py-24 max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-black mb-4">Simple Pricing</h2>
        <p className="text-navy-400 mb-12">One verification. One price.</p>
        
        <div className="bg-navy-900 rounded-3xl p-12 border border-navy-800">
          <div className="text-6xl font-black mb-4 font-mono">₦2,500</div>
          <p className="text-navy-400 mb-2">per verification</p>
          <p className="text-amber-400 text-sm mb-8">⏱️ Certificate valid for 1 hour (fresh verification for every trade)</p>
          <button
            onClick={handleGetVerified}
            className="px-12 py-5 bg-gradient-to-b from-navy-600 to-navy-700 hover:from-navy-700 hover:to-navy-800 rounded-2xl font-bold text-xl transition-all shadow-xl shadow-navy-900/50"
          >
            Get Verified & Trade Safe →
          </button>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 py-24 bg-navy-900/50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl font-black text-center mb-16">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "Why does the certificate expire in 1 hour?",
                a: "Fresh verification for every trade. Someone verified yesterday could be compromised today. The 1-hour window ensures you're trading with someone who just proved their identity moments ago — not days or weeks ago."
              },
              {
                q: "Who pays for the verification?",
                a: "The person requesting verification pays ₦2,500. The person being verified completes the process for FREE. This way, you're paying for peace of mind before sending money."
              },
              {
                q: "What if they refuse to verify?",
                a: "That's a red flag. Legitimate traders have nothing to hide. If someone refuses IDENTIS verification, don't trade with them."
              },
              {
                q: "What data do you collect?",
                a: "Phone number (OTP), selfie (liveness check - deleted in 24hrs), and BVN/NIN (verified via Dojah). We're NDPR compliant. See our Privacy Policy."
              },
              {
                q: "Can I get a refund?",
                a: "No. The verification fee is non-refundable once the process starts. This prevents abuse of the system."
              },
              {
                q: "Is my BVN safe?",
                a: "We never store your full BVN. We only verify it matches your phone number through Dojah's secure API. Your data is encrypted and protected."
              },
            ].map((faq, i) => (
              <details key={i} className="bg-navy-900 border border-navy-800 rounded-2xl p-6 group">
                <summary className="font-bold cursor-pointer list-none flex justify-between items-center">
                  {faq.q}
                  <span className="text-navy-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-4 text-navy-300/70 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-24 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-4xl font-black mb-4">Don't Risk It</h2>
          <p className="text-xl text-navy-300/70 mb-8">
            ₦2,500 is nothing compared to losing millions to a scammer. Verify before you trade.
          </p>
          <button
            onClick={handleGetVerified}
            className="px-12 py-5 bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-2xl font-bold text-xl transition-all shadow-xl shadow-emerald-900/50"
          >
            Get Verified Now →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-navy-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="IDENTIS" className="w-8 h-8 rounded-lg" />
            <span className="font-bold">IDENTIS</span>
          </div>
          <div className="flex items-center gap-6 text-navy-500 text-sm">
            <a href="/terms" className="hover:text-white">Terms</a>
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <a href="https://t.me/IdentisBot" className="hover:text-white">Telegram</a>
            <span>© 2026 IDENTIS 🇳🇬</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
