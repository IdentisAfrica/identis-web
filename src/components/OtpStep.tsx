import { useState } from 'react'

interface Props {
  verificationId: string
  phone: string
  onNext: () => void
}

export default function OtpStep({ phone, onNext }: Props) {
  const [otp, setOtp] = useState('')

  const handleSkipOtp = () => {
    onNext()
  }

  const maskedPhone = phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1***$3')

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
          <span className="text-4xl">💬</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Enter OTP</h2>
        <p className="text-gray-400 mt-2">Code sent to {maskedPhone}</p>
      </div>

      <div className="mb-6">
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
        onClick={handleSkipOtp}
        className="w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/20"
      >
        Continue (Demo) →
      </button>

      <p className="text-center text-xs text-gray-500 mt-4">
        Demo mode: OTP verification skipped for testing
      </p>
    </div>
  )
}
