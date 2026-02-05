export default function Contact() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    alert('Message sent! We\'ll get back to you within 24 hours.')
  }

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      <header className="border-b border-white/10">
        <nav className="container mx-auto px-4 py-5 flex justify-between items-center">
          <a href="/" className="text-2xl font-bold text-[#00ff88] font-mono">IDENTIS</a>
          <a href="/" className="text-white/70 hover:text-white transition">← Back to Home</a>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] bg-clip-text text-transparent">
            Get in Touch
          </h1>
          <p className="text-white/70 text-lg max-w-2xl mx-auto">
            Have questions about identity verification for P2P trading? We're here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-[#00ff88] hover:shadow-lg hover:shadow-[#00ff88]/20 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00ff88] to-[#00d4ff] rounded-lg flex items-center justify-center text-2xl mb-4">📧</div>
            <h3 className="text-xl font-semibold text-[#00ff88] mb-2">Email</h3>
            <p className="text-white/70 text-sm mb-3">Send us a message anytime</p>
            <a href="mailto:hello@identis.ng" className="text-[#00d4ff] hover:underline break-all">hello@identis.ng</a>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-[#00ff88] hover:shadow-lg hover:shadow-[#00ff88]/20 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00ff88] to-[#00d4ff] rounded-lg flex items-center justify-center text-2xl mb-4">💬</div>
            <h3 className="text-xl font-semibold text-[#00ff88] mb-2">WhatsApp</h3>
            <p className="text-white/70 text-sm mb-3">Quick support via WhatsApp</p>
            <a href="https://wa.me/2348114788333" target="_blank" rel="noopener noreferrer" className="text-[#00d4ff] hover:underline">+234 811 478 8333</a>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-[#00ff88] hover:shadow-lg hover:shadow-[#00ff88]/20 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00ff88] to-[#00d4ff] rounded-lg flex items-center justify-center text-2xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold text-[#00ff88] mb-2">Telegram Bot</h3>
            <p className="text-white/70 text-sm mb-3">Verify identities instantly</p>
            <a href="https://t.me/IdentisBot" target="_blank" rel="noopener noreferrer" className="text-[#00d4ff] hover:underline">@IdentisBot</a>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-[#00ff88] hover:shadow-lg hover:shadow-[#00ff88]/20 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00ff88] to-[#00d4ff] rounded-lg flex items-center justify-center text-2xl mb-4">📍</div>
            <h3 className="text-xl font-semibold text-[#00ff88] mb-2">Office</h3>
            <p className="text-white/70 text-sm mb-3">Ilupeju Estate, Akobo</p>
            <span className="text-white/60">Ibadan, Oyo State, Nigeria</span>
          </div>
        </div>

        <div className="max-w-3xl mx-auto bg-white/5 border border-white/10 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-[#00ff88] mb-6">Send us a Message</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-white/90 font-medium mb-2">Name *</label>
              <input type="text" id="name" required className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition" />
            </div>

            <div>
              <label htmlFor="email" className="block text-white/90 font-medium mb-2">Email *</label>
              <input type="email" id="email" required className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition" />
            </div>

            <div>
              <label htmlFor="subject" className="block text-white/90 font-medium mb-2">Subject *</label>
              <input type="text" id="subject" required className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition" />
            </div>

            <div>
              <label htmlFor="message" className="block text-white/90 font-medium mb-2">Message *</label>
              <textarea id="message" required rows={6} className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition resize-y" />
            </div>

            <button type="submit" className="w-full py-3 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-[#0a0e27] font-bold rounded-lg hover:shadow-lg hover:shadow-[#00ff88]/30 hover:-translate-y-0.5 transition-all">
              Send Message
            </button>
          </form>
        </div>
      </main>

      <footer className="border-t border-white/10 py-10 text-center text-white/50">
        <p>&copy; 2025 IDENTIS. Secure identity verification for P2P cryptocurrency trading.</p>
      </footer>
    </div>
  )
}
