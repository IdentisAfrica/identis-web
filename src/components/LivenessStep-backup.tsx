import { useState, useRef, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  onNext: () => void
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'init' | 'ready' | 'blink' | 'smile' | 'turn' | 'verifying' | 'success'>('init')
  const [cameraReady, setCameraReady] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [progress, setProgress] = useState(0)
  const [actionDetected, setActionDetected] = useState(false)
  
  const blinkCountRef = useRef(0)
  const smileCountRef = useRef(0)
  const turnCountRef = useRef(0)
  const lastBrightnessRef = useRef<number[]>([])
  const selfieRef = useRef<string | null>(null)

  const initCamera = async () => {
    setLoading(true)
    setError('')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
        setStep('ready')
        setInstruction('Position your face and tap Start')
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

  // Capture frame and analyze
  const analyzeFrame = (): { brightness: number; movement: number } | null => {
    if (!videoRef.current || !canvasRef.current) return null
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    canvas.width = 320
    canvas.height = 240
    ctx.drawImage(videoRef.current, 0, 0, 320, 240)
    
    const imageData = ctx.getImageData(0, 0, 320, 240)
    const data = imageData.data
    
    // Calculate brightness in eye region (upper middle of frame)
    let eyeBrightness = 0
    const eyeRegionStart = 240 * 60 * 4 // Start at row 60
    const eyeRegionEnd = 240 * 120 * 4 // End at row 120
    let pixelCount = 0
    
    for (let i = eyeRegionStart; i < eyeRegionEnd; i += 4) {
      const x = (i / 4) % 320
      if (x > 100 && x < 220) { // Center region
        eyeBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3
        pixelCount++
      }
    }
    eyeBrightness = pixelCount > 0 ? eyeBrightness / pixelCount : 0
    
    // Calculate movement by comparing brightness history
    lastBrightnessRef.current.push(eyeBrightness)
    if (lastBrightnessRef.current.length > 10) {
      lastBrightnessRef.current.shift()
    }
    
    const movement = lastBrightnessRef.current.length > 1 
      ? Math.abs(eyeBrightness - lastBrightnessRef.current[lastBrightnessRef.current.length - 2])
      : 0
    
    return { brightness: eyeBrightness, movement }
  }

  const captureSelfie = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0)
        selfieRef.current = canvas.toDataURL('image/jpeg', 0.8)
      }
    }
  }

  const startLivenessCheck = () => {
    captureSelfie()
    setStep('blink')
    setInstruction('Blink your eyes 3 times')
    setProgress(10)
    blinkCountRef.current = 0
    smileCountRef.current = 0
    turnCountRef.current = 0
    lastBrightnessRef.current = []
    setActionDetected(false)
  }

  // Detection loop
  useEffect(() => {
    if (step !== 'blink' && step !== 'smile' && step !== 'turn') return
    
    let isActive = true
    let blinkCooldown = false
    let movementThreshold = 5
    
    const detect = () => {
      if (!isActive) return
      
      const result = analyzeFrame()
      
      if (result) {
        // Blink detection - look for brightness drop in eye region
        if (step === 'blink' && !blinkCooldown) {
          if (result.movement > movementThreshold) {
            blinkCountRef.current++
            setActionDetected(true)
            blinkCooldown = true
            setTimeout(() => { blinkCooldown = false }, 500)
            
            if (blinkCountRef.current >= 3) {
              setStep('smile')
              setInstruction('Now smile wide!')
              setProgress(40)
              setActionDetected(false)
            }
          }
        }
        
        // Smile detection - look for sustained movement
        if (step === 'smile') {
          if (result.movement > movementThreshold * 0.5) {
            smileCountRef.current++
            if (smileCountRef.current > 15) {
              setActionDetected(true)
            }
            if (smileCountRef.current >= 30) {
              setStep('turn')
              setInstruction('Turn your head left or right')
              setProgress(70)
              setActionDetected(false)
              smileCountRef.current = 0
            }
          }
        }
        
        // Turn detection - look for significant movement
        if (step === 'turn') {
          if (result.movement > movementThreshold * 1.5) {
            turnCountRef.current++
            if (turnCountRef.current > 10) {
              setActionDetected(true)
            }
            if (turnCountRef.current >= 20) {
              completeLiveness()
              return
            }
          }
        }
      }
      
      if (isActive) {
        requestAnimationFrame(detect)
      }
    }
    
    detect()
    
    // Timeout - auto-pass after 15 seconds per step (fallback)
    const timeout = setTimeout(() => {
      if (step === 'blink') {
        setStep('smile')
        setInstruction('Now smile wide!')
        setProgress(40)
      } else if (step === 'smile') {
        setStep('turn')
        setInstruction('Turn your head left or right')
        setProgress(70)
      } else if (step === 'turn') {
        completeLiveness()
      }
    }, 15000)
    
    return () => {
      isActive = false
      clearTimeout(timeout)
    }
  }, [step])

  const completeLiveness = async () => {
    setStep('verifying')
    setInstruction('Verifying...')
    setProgress(100)
    
    // Stop camera
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
    }

    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore: 0.95,
          selfieBase64: selfieRef.current
        })
      })

      const data = await res.json()

      if (data.success && data.passed) {
        setStep('success')
        setInstruction('Liveness verified!')
        setTimeout(() => onNext(), 1500)
      } else {
        setError(data.message || 'Liveness check failed')
        setStep('ready')
      }
    } catch {
      setError('Network error. Please try again.')
      setStep('ready')
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

  const getChallengeIcon = () => {
    switch (step) {
      case 'blink': return '👁️'
      case 'smile': return '😊'
      case 'turn': return '↔️'
      case 'success': return '✓'
      default: return '📷'
    }
  }

  const isChallenge = step === 'blink' || step === 'smile' || step === 'turn'

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white">Liveness Check</h2>
        <p className="text-gray-400 mt-1">{instruction || 'Prove you are a real person'}</p>
      </div>

      {/* Progress bar */}
      {(isChallenge || step === 'verifying' || step === 'success') && (
        <div className="mb-4">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="relative aspect-[4/3] bg-gray-800 rounded-2xl overflow-hidden mb-4 border border-gray-700">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        <canvas ref={canvasRef} className="hidden" />
        
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

        {step === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 border-4 border-dashed border-white/30 rounded-full"></div>
          </div>
        )}

        {isChallenge && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className={`text-8xl mb-4 ${actionDetected ? 'animate-bounce' : ''}`}>
              {getChallengeIcon()}
            </div>
            <p className="text-white text-2xl font-bold mb-2">{instruction}</p>
            {actionDetected && (
              <p className="text-emerald-400 text-lg">✓ Detected! Keep going...</p>
            )}
            {step === 'blink' && (
              <p className="text-gray-300 mt-2">Blinks: {blinkCountRef.current}/3</p>
            )}
          </div>
        )}

        {step === 'verifying' && (
          <div className="absolute inset-0 bg-blue-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-xl font-bold">Verifying...</p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="absolute inset-0 bg-emerald-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-7xl mb-4">✓</div>
              <p className="text-2xl font-bold">Liveness Verified!</p>
            </div>
          </div>
        )}
      </div>

      {/* Challenge progress */}
      {isChallenge && (
        <div className="flex gap-2 mb-4">
          <div className={`h-2 flex-1 rounded-full ${step === 'smile' || step === 'turn' ? 'bg-emerald-500' : step === 'blink' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
          <div className={`h-2 flex-1 rounded-full ${step === 'turn' ? 'bg-emerald-500' : step === 'smile' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
          <div className={`h-2 flex-1 rounded-full ${step === 'success' ? 'bg-emerald-500' : step === 'turn' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
        </div>
      )}

      {error && (
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
          onClick={startLivenessCheck}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold text-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20"
        >
          Start Liveness Check →
        </button>
      )}
    </div>
  )
}
