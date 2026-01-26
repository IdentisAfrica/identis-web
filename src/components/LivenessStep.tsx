import { useState, useRef, useEffect } from 'react'
import * as faceapi from '@vladmandic/face-api'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

interface Props {
  verificationId: string
  onNext: () => void
}

const LEFT_EYE = [36, 37, 38, 39, 40, 41]
const RIGHT_EYE = [42, 43, 44, 45, 46, 47]
const NOSE_TIP = 30
const LEFT_FACE = 0
const RIGHT_FACE = 16

function calculateEAR(eyePoints: faceapi.Point[]): number {
  const v1 = Math.hypot(eyePoints[1].x - eyePoints[5].x, eyePoints[1].y - eyePoints[5].y)
  const v2 = Math.hypot(eyePoints[2].x - eyePoints[4].x, eyePoints[2].y - eyePoints[4].y)
  const h = Math.hypot(eyePoints[0].x - eyePoints[3].x, eyePoints[0].y - eyePoints[3].y)
  return (v1 + v2) / (2.0 * h)
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'challenge' | 'done' | 'error'>('loading')
  const [loadingText, setLoadingText] = useState('Loading...')
  const [faceOk, setFaceOk] = useState(false)
  const [readyToStart, setReadyToStart] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [debug, setDebug] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef(0)
  const phaseRef = useRef(phase)
  const stepRef = useRef(step)
  
  // Challenge tracking
  const holdCount = useRef(0)
  const stableCount = useRef(0)
  const challengeComplete = useRef(false)
  
  // Blink detection
  const earHistory = useRef<number[]>([])
  const baselineEAR = useRef(0)
  const sawBlink = useRef(false)
  const eyesOpen = useRef(false)

  const challenges = ['blink', 'left', 'right']

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { stepRef.current = step }, [step])

  const submit = async (selfie: string) => {
    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, livenessScore: 0.9, selfieBase64: selfie })
      })
      if (!res.ok) throw new Error('Failed')
      setPhase('done')
      setTimeout(onNext, 1000)
    } catch {
      setError('Verification failed')
      setPhase('error')
    }
  }

  const capture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  const nextStep = () => {
    // Reset all tracking for next challenge
    holdCount.current = 0
    challengeComplete.current = false
    earHistory.current = []
    baselineEAR.current = 0
    sawBlink.current = false
    eyesOpen.current = false
    setProgress(0)
    
    if (stepRef.current >= challenges.length - 1) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
      submit(capture())
    } else {
      setStep(s => s + 1)
    }
  }

  const detect = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || phaseRef.current === 'done') {
      animRef.current = requestAnimationFrame(detect)
      return
    }

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks()

      if (!detection) {
        setFaceOk(false)
        stableCount.current = 0
        setDebug('No face detected')
        animRef.current = requestAnimationFrame(detect)
        return
      }

      const landmarks = detection.landmarks.positions
      const box = detection.detection.box
      const faceW = box.width / video.videoWidth
      const goodSize = faceW > 0.2 && faceW < 0.7

      const leftEyePoints = LEFT_EYE.map(i => landmarks[i])
      const rightEyePoints = RIGHT_EYE.map(i => landmarks[i])
      const leftEAR = calculateEAR(leftEyePoints)
      const rightEAR = calculateEAR(rightEyePoints)
      const avgEAR = (leftEAR + rightEAR) / 2

      const nose = landmarks[NOSE_TIP]
      const leftFace = landmarks[LEFT_FACE]
      const rightFace = landmarks[RIGHT_FACE]
      const faceWidth = rightFace.x - leftFace.x
      const noseOffset = ((nose.x - leftFace.x) / faceWidth - 0.5) * 2

      if (goodSize) {
        stableCount.current++
        if (stableCount.current > 5) {
          setFaceOk(true)
          setReadyToStart(true)
        }
      } else {
        stableCount.current = 0
        setFaceOk(false)
        // Don't reset readyToStart - once ready, stay ready
      }

      const currentPhase = phaseRef.current
      const currentStep = stepRef.current

      // READY PHASE
      if (currentPhase === 'ready') {
        setDebug(`EAR:${avgEAR.toFixed(2)} Size:${(faceW * 100).toFixed(0)}%`)
        if (!goodSize) {
          setInstruction(faceW < 0.2 ? 'Move closer' : 'Move back')
        } else if (stableCount.current > 5) {
          setInstruction('')
        } else {
          setInstruction('Hold still...')
        }
      }

      // CHALLENGE PHASE
      if (currentPhase === 'challenge' && !challengeComplete.current) {
        const current = challenges[currentStep]

        if (current === 'blink') {
          // Build baseline from first 5 frames
          if (earHistory.current.length < 5) {
            earHistory.current.push(avgEAR)
            setDebug(`Calibrating... ${earHistory.current.length}/5`)
            setInstruction('Keep eyes open...')
          } else {
            if (baselineEAR.current === 0) {
              baselineEAR.current = earHistory.current.reduce((a, b) => a + b, 0) / 5
            }
            
            const dropThreshold = baselineEAR.current * 0.65 // 35% drop = blink
            const isBlinking = avgEAR < dropThreshold
            
            setDebug(`EAR:${avgEAR.toFixed(2)} Base:${baselineEAR.current.toFixed(2)}`)
            
            if (isBlinking && !sawBlink.current) {
              sawBlink.current = true
              setProgress(50)
              setInstruction('Good! Now open...')
            }
            
            if (sawBlink.current && !isBlinking) {
              eyesOpen.current = true
            }
            
            if (sawBlink.current && eyesOpen.current) {
              challengeComplete.current = true
              setProgress(100)
              setInstruction('Blink detected!')
              setTimeout(nextStep, 300)
            } else if (!sawBlink.current) {
              setInstruction('Blink now!')
            }
          }
        }

        else if (current === 'left') {
          // Need nose to be RIGHT of center (from user's perspective turning left)
          const yawDegrees = noseOffset * 45
          setDebug(`Yaw: ${yawDegrees.toFixed(0)}° (turn left)`)
          
          const passed = noseOffset > 0.25 // ~11 degrees
          
          if (passed) {
            holdCount.current++
            setProgress((holdCount.current / 8) * 100)
            setInstruction('Hold...')
            if (holdCount.current >= 8) {
              challengeComplete.current = true
              setInstruction('Good!')
              setTimeout(nextStep, 300)
            }
          } else {
            holdCount.current = Math.max(0, holdCount.current - 2)
            setProgress((holdCount.current / 8) * 100)
            setInstruction('Turn head LEFT')
          }
        }

        else if (current === 'right') {
          const yawDegrees = noseOffset * 45
          setDebug(`Yaw: ${yawDegrees.toFixed(0)}° (turn right)`)
          
          const passed = noseOffset < -0.25 // ~-11 degrees
          
          if (passed) {
            holdCount.current++
            setProgress((holdCount.current / 8) * 100)
            setInstruction('Hold...')
            if (holdCount.current >= 8) {
              challengeComplete.current = true
              setInstruction('Good!')
              setTimeout(nextStep, 300)
            }
          } else {
            holdCount.current = Math.max(0, holdCount.current - 2)
            setProgress((holdCount.current / 8) * 100)
            setInstruction('Turn head RIGHT')
          }
        }
      }

    } catch (e) {
      console.error('Detection error:', e)
    }

    animRef.current = requestAnimationFrame(detect)
  }

  const start = () => {
    if (!readyToStart) return
    setStep(0)
    setProgress(0)
    holdCount.current = 0
    challengeComplete.current = false
    earHistory.current = []
    baselineEAR.current = 0
    sawBlink.current = false
    eyesOpen.current = false
    setPhase('challenge')
    setInstruction('Keep eyes open...')
  }

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        setLoadingText('Loading face models...')
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL)
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL)
        
        if (!mounted) return

        setLoadingText('Starting camera...')
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        
        if (!mounted) { 
          stream.getTracks().forEach(t => t.stop())
          return 
        }
        
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setPhase('ready')
        setInstruction('Position your face')
        animRef.current = requestAnimationFrame(detect)
      } catch (e) {
        console.error('Init error:', e)
        setError((e as Error).message)
        setPhase('error')
      }
    }

    init()
    
    return () => {
      mounted = false
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold text-white text-center mb-1">Liveness Check</h2>
      <p className="text-gray-400 text-sm text-center mb-4">Follow the instructions</p>

      <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-52 h-72 rounded-[50%] border-4 transition-colors ${
            phase === 'challenge' ? 'border-blue-400' : readyToStart ? 'border-green-400' : 'border-gray-500'
          }`} />
        </div>

        <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
          faceOk ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {faceOk ? '✓ Face OK' : '✗ No Face'}
        </div>

        {phase === 'challenge' && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
            {step + 1}/{challenges.length}
          </div>
        )}

        {phase === 'loading' && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-white">{loadingText}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="absolute inset-0 bg-green-600 flex flex-col items-center justify-center">
            <span className="text-6xl mb-2">✓</span>
            <p className="text-white font-bold text-xl">Verified!</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {phase === 'challenge' && (
        <div className="mb-4">
          <div className="flex gap-1 mb-2">
            {challenges.map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded ${
                i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : 'bg-gray-700'
              }`} />
            ))}
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {instruction && (
        <div className={`rounded-xl p-4 mb-4 text-center ${
          phase === 'challenge' ? 'bg-blue-500/20 border border-blue-500/40' :
          readyToStart ? 'bg-green-500/20 border border-green-500/40' : 'bg-gray-800 border border-gray-700'
        }`}>
          <p className="text-white font-semibold text-lg">{instruction}</p>
        </div>
      )}

      <p className="text-gray-600 text-xs text-center font-mono mb-3">{debug}</p>

      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-center">{error}</p>
        </div>
      )}

      {phase === 'ready' && (
        <button
          onClick={start}
          disabled={!readyToStart}
          className={`w-full py-4 rounded-xl font-bold text-lg ${
            readyToStart ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {readyToStart ? 'Perfect! Tap Start' : 'Position Your Face'}
        </button>
      )}

      {phase === 'error' && (
        <button onClick={() => window.location.reload()} className="w-full py-4 rounded-xl font-bold bg-red-500 text-white">
          Try Again
        </button>
      )}
    </div>
  )
}
