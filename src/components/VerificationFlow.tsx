import { useState } from 'react'
import PhoneStep from './PhoneStep'
import PaymentStep from './PaymentStep'
import OtpStep from './OtpStep'
import LivenessStep from './LivenessStep'
import IdVerifyStep from './IdVerifyStep'
import ResultStep from './ResultStep'

type Step = 'phone' | 'payment' | 'otp' | 'liveness' | 'id-verify' | 'result'

interface Props {
  onBack: () => void
}

interface VerificationData {
  verificationId?: string
  phone?: string
}

export default function VerificationFlow({ onBack }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [data, setData] = useState<VerificationData>({})

  const updateData = (newData: Partial<VerificationData>) => {
    setData(prev => ({ ...prev, ...newData }))
  }

  const steps = ['phone', 'payment', 'otp', 'liveness', 'id-verify', 'result']
  const currentIndex = steps.indexOf(step)

  return (
    <div className="min-h-screen bg-[#0a0f1c]">
      {/* Header */}
      <header className="bg-[#0a0f1c] border-b border-gray-800">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">ID</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">IDENTIS</h1>
              <p className="text-xs text-gray-500">Identity Verification</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= currentIndex
                  ? i === currentIndex 
                    ? 'bg-gradient-to-r from-blue-500 to-emerald-500' 
                    : 'bg-emerald-500'
                  : 'bg-gray-800'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-gray-500 mt-2">
          Step {currentIndex + 1} of {steps.length}
        </p>
      </div>

      {/* Steps */}
      <main className="max-w-md mx-auto px-4 pb-8">
        {step === 'phone' && (
          <PhoneStep
            onNext={(verificationId, phone) => {
              updateData({ verificationId, phone })
              setStep('payment')
            }}
          />
        )}
        {step === 'payment' && (
          <PaymentStep
            verificationId={data.verificationId!}
            onNext={() => setStep('otp')}
            onBack={() => setStep('phone')}
          />
        )}
        {step === 'otp' && (
          <OtpStep
            verificationId={data.verificationId!}
            phone={data.phone!}
            onNext={() => setStep('liveness')}
          />
        )}
        {step === 'liveness' && (
          <LivenessStep
            verificationId={data.verificationId!}
            onNext={() => setStep('id-verify')}
          />
        )}
        {step === 'id-verify' && (
          <IdVerifyStep
            verificationId={data.verificationId!}
            onNext={() => setStep('result')}
          />
        )}
        {step === 'result' && (
          <ResultStep
            verificationId={data.verificationId!}
          />
        )}
      </main>
    </div>
  )
}
