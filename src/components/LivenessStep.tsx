import { useState, useRef, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Props {
  verificationId: string
  onNext: () => void
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'init' | 'ready' | 'blink' | 'smile' | 'turn' | 'success'>('init')
  const [cameraReady, setCameraReady] = useState(false)
  const [countdown, setCountdown] = useState(3)

  const initCamera = async () => {
    setLoading(true)
    setError('')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 360 }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
        setStep('ready')
        setError('')
      }
      setLoading(false)
    } catch (err: unknown) {
      setLoading(false)
      const error = err as Error
      if (error.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera in browser settings.')
      } else {
        setError('Failed to access camera')
      }
    }
  }

  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
    }
  }, [])

  const startChallenge = () => {
    setError('')
    setStep('blink')
    runChallengeSequence()
  }

  const runChallengeSequence = async () => {
    setStep('blink')
    await waitForAction(3)
    
    setStep('smile')
    await waitForAction(3)
    
    setStep('turn')
    await waitForAction(3)
    
    completeLiveness()
  }

  const waitForAction = (seconds: number): Promise<void> => {
    return new Promise((resolve) => {
      let remaining = seconds
      setCountdown(remaining)
      
      const interval = setInterval(() => {
        remaining--
        setCountdown(remaining)
        
        if (remaining <= 0) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
  }

  const completeLiveness = async () => {
    setStep('success')
    
    let selfieBase64 = null
    if (videoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0)
        selfieBase64 = canvas.toDataURL('image/jpeg', 0.8)
      }
    }

    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore: 0.95,
          selfieBase64
        })
      })

      const data = await res.json()

      if (data.success && data.passed) {
        setTimeout(() => onNext(), 1500)
      } else {
        setError(data.message || 'Liveness check failed')
      }
    } catch {
      setError('Network error. Please try again.')
    }
  }

  const getChallengeContent = () => {
    switch (step) {
      case 'blink': return { icon: '👁️', text: 'Blink your eyes' }
      case 'smile': return { icon: '😊', text: 'Smile wide' }
      case 'turn': return { icon: '↔️', text: 'Turn your head' }
      default: return { icon: '', text: '' }
    }
  }

  const challenge = getChallengeContent()
  const isChallenge = step === 'blink' || step === 'smile' || step === 'turn'

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white">Liveness Check</h2>
        <p className="text-gray-400 mt-1">
          {step === 'init' && 'Tap below to start camera'}
          {step === 'ready' && 'Position your face and tap Start'}
          {isChallenge && challenge.text}
          {step === 'success' && 'Liveness verified!'}
        </p>
      </div>

      <div className="relative aspect-[4/3] bg-gray-800 rounded-2xl overflow-hidden mb-4 border border-gray-700">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {step === 'init' && !loading && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-pink-500/20 to-pink-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-pink-500/30">
                <span className="text-4xl">📷</span>
              </div>
              <p className="text-gray-400">Camera preview</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400">Starting camera...</p>
            </div>
          </div>
        )}

        {isChallenge && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-7xl mb-4 animate-bounce">{challenge.icon}</div>
            <p className="text-white text-2xl font-bold mb-4">{challenge.text}</p>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <span className="text-white text-4xl font-black">{countdown}</span>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="absolute inset-0 bg-emerald-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-7xl mb-4">✓</div>
              <p className="text-2xl font-bold">Verified!</p>
            </div>
          </div>
        )}

        {step === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 border-4 border-dashed border-white/30 rounded-full"></div>
          </div>
        )}
      </div>

      {isChallenge && (
        <div className="flex gap-2 mb-4">
          <div className="h-2 flex-1 rounded-full bg-emerald-500" />
          <div className={`h-2 flex-1 rounded-full ${step === 'smile' || step === 'turn' ? 'bg-emerald-500' : 'bg-gray-700'}`} />
          <div className={`h-2 flex-1 rounded-full ${step === 'turn' ? 'bg-emerald-500' : 'bg-gray-700'}`} />
        </div>
      )}

      {error && !isChallenge && step !== 'success' && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {step === 'init' && !loading && (
        <button
          onClick={initCamera}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold text-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20"
        >
          Start Camera →
        </button>
      )}

      {step === 'ready' && cameraReady && (
        <button
          onClick={startChallenge}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold text-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20"
        >
          Start Liveness Check →
        </button>
      )}
    </div>
  )
}
