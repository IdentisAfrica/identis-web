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
  if (h === 0) return 0.3
  return (v1 + v2) / (2.0 * h)
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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
  const [metric, setMetric] = useState({ label: '', value: 0, target: 0, unit: '' })

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef(0)
  const phaseRef = useRef(phase)
  const stepRef = useRef(step)
  
  const challengesRef = useRef<string[]>(['blink', 'left', 'right'])
  
  const stableCount = useRef(0)
  const challengeComplete = useRef(false)
  const holdFrames = useRef(0)
  
  // Blink detection
  const earBaseline = useRef(0)
  const earMin = useRef(1)
  const blinkPhase = useRef<'calibrate' | 'waitClose' | 'waitOpen' | 'done'>('calibrate')
  const calibrationFrames = useRef(0)
  const earSum = useRef(0)
  
  // Head turn
  const yawBaseline = useRef<number | null>(null)
  const yawCalFrames = useRef(0)
  const yawSum = useRef(0)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { stepRef.current = step }, [step])

  const submit = async (selfie: string) => {
    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, livenessScore: 0.85, selfieBase64: selfie })
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
    holdFrames.current = 0
    challengeComplete.current = false
    earBaseline.current = 0
    earMin.current = 1
    blinkPhase.current = 'calibrate'
    calibrationFrames.current = 0
    earSum.current = 0
    yawBaseline.current = null
    yawCalFrames.current = 0
    yawSum.current = 0
    setProgress(0)
    setMetric({ label: '', value: 0, target: 0, unit: '' })
    
    const challenges = challengesRef.current
    if (stepRef.current >= challenges.length - 1) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
      submit(capture())
    } else {
      const nextIdx = stepRef.current + 1
      setStep(nextIdx)
      stepRef.current = nextIdx
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
        setInstruction('Look at camera')
        animRef.current = requestAnimationFrame(detect)
        return
      }

      const landmarks = detection.landmarks.positions
      const box = detection.detection.box
      const faceW = box.width / video.videoWidth
      const goodSize = faceW > 0.2 && faceW < 0.7

      // Calculate EAR
      const leftEyePoints = LEFT_EYE.map(i => landmarks[i])
      const rightEyePoints = RIGHT_EYE.map(i => landmarks[i])
      const avgEAR = (calculateEAR(leftEyePoints) + calculateEAR(rightEyePoints)) / 2

      // Calculate yaw
      const nose = landmarks[NOSE_TIP]
      const leftFace = landmarks[LEFT_FACE]
      const rightFace = landmarks[RIGHT_FACE]
      const faceWidth = rightFace.x - leftFace.x
      const noseRatio = (nose.x - leftFace.x) / faceWidth
      const yaw = (noseRatio - 0.5) * 100 // Scale for easier reading

      if (goodSize) {
        stableCount.current++
        if (stableCount.current > 5) {
          setFaceOk(true)
          setReadyToStart(true)
        }
      } else {
        stableCount.current = 0
        setFaceOk(false)
      }

      const currentPhase = phaseRef.current
      const currentStep = stepRef.current
      const challenges = challengesRef.current

      // READY PHASE
      if (currentPhase === 'ready') {
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

        // ========== BLINK ==========
        if (current === 'blink') {
          if (blinkPhase.current === 'calibrate') {
            calibrationFrames.current++
            earSum.current += avgEAR
            
            if (calibrationFrames.current >= 15) {
              earBaseline.current = earSum.current / 15
              blinkPhase.current = 'waitClose'
            }
            
            setInstruction('Keep eyes OPEN...')
            setMetric({ label: 'Calibrating', value: calibrationFrames.current, target: 15, unit: '' })
            setProgress((calibrationFrames.current / 15) * 30)
          }
          else if (blinkPhase.current === 'waitClose') {
            const dropPercent = ((earBaseline.current - avgEAR) / earBaseline.current) * 100
            earMin.current = Math.min(earMin.current, avgEAR)
            
            setMetric({ label: 'Eye closure', value: Math.max(0, dropPercent), target: 20, unit: '%' })
            setProgress(30 + Math.min(35, dropPercent * 1.75))
            
            // 20% drop = eyes closing (more forgiving)
            if (dropPercent > 20) {
              blinkPhase.current = 'waitOpen'
              setProgress(65)
            }
            
            setInstruction('Now BLINK! 👁️')
          }
          else if (blinkPhase.current === 'waitOpen') {
            const recoveryPercent = ((avgEAR - earMin.current) / (earBaseline.current - earMin.current)) * 100
            
            setMetric({ label: 'Eyes opening', value: Math.min(100, recoveryPercent), target: 70, unit: '%' })
            setProgress(65 + Math.min(35, recoveryPercent * 0.35))
            
            // Eyes opened back up
            if (avgEAR > earBaseline.current * 0.85) {
              blinkPhase.current = 'done'
              challengeComplete.current = true
              setProgress(100)
              setInstruction('Blink detected! ✓')
              setTimeout(nextStep, 400)
            } else {
              setInstruction('Open eyes wide!')
            }
          }
        }

        // ========== TURN LEFT ==========
        else if (current === 'left') {
          // Calibrate baseline
          if (yawBaseline.current === null) {
            yawCalFrames.current++
            yawSum.current += yaw
            
            if (yawCalFrames.current >= 10) {
              yawBaseline.current = yawSum.current / 10
            }
            
            setInstruction('Face forward...')
            setMetric({ label: 'Calibrating', value: yawCalFrames.current, target: 10, unit: '' })
            setProgress((yawCalFrames.current / 10) * 20)
          } else {
            const turnAmount = yaw - yawBaseline.current
            const targetTurn = 12 // More forgiving: 12 instead of 18
            const turnPercent = Math.min(100, (turnAmount / targetTurn) * 100)
            
            setMetric({ label: 'Turn amount', value: turnAmount.toFixed(0), target: targetTurn, unit: '°' })
            
            if (turnAmount > targetTurn) {
              holdFrames.current++
              const holdPercent = (holdFrames.current / 6) * 100 // 6 frames instead of 8
              setProgress(20 + holdPercent * 0.8)
              setInstruction('Hold! ' + (6 - holdFrames.current))
              
              if (holdFrames.current >= 6) {
                challengeComplete.current = true
                setProgress(100)
                setInstruction('Good! ✓')
                setTimeout(nextStep, 400)
              }
            } else {
              holdFrames.current = Math.max(0, holdFrames.current - 1)
              setProgress(20 + Math.max(0, turnPercent * 0.6))
              setInstruction('Turn LEFT ← ← ←')
            }
          }
        }

        // ========== TURN RIGHT ==========
        else if (current === 'right') {
          if (yawBaseline.current === null) {
            yawCalFrames.current++
            yawSum.current += yaw
            
            if (yawCalFrames.current >= 10) {
              yawBaseline.current = yawSum.current / 10
            }
            
            setInstruction('Face forward...')
            setMetric({ label: 'Calibrating', value: yawCalFrames.current, target: 10, unit: '' })
            setProgress((yawCalFrames.current / 10) * 20)
          } else {
            const turnAmount = yawBaseline.current - yaw // Inverted for right turn
            const targetTurn = 12
            const turnPercent = Math.min(100, (turnAmount / targetTurn) * 100)
            
            setMetric({ label: 'Turn amount', value: turnAmount.toFixed(0), target: targetTurn, unit: '°' })
            
            if (turnAmount > targetTurn) {
              holdFrames.current++
              const holdPercent = (holdFrames.current / 6) * 100
              setProgress(20 + holdPercent * 0.8)
              setInstruction('Hold! ' + (6 - holdFrames.current))
              
              if (holdFrames.current >= 6) {
                challengeComplete.current = true
                setProgress(100)
                setInstruction('Good! ✓')
                setTimeout(nextStep, 400)
              }
            } else {
              holdFrames.current = Math.max(0, holdFrames.current - 1)
              setProgress(20 + Math.max(0, turnPercent * 0.6))
              setInstruction('Turn RIGHT → → →')
            }
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
    
    const randomChallenges = shuffle(['blink', 'left', 'right'])
    challengesRef.current = randomChallenges
    
    setStep(0)
    stepRef.current = 0
    setProgress(0)
    holdFrames.current = 0
    challengeComplete.current = false
    earBaseline.current = 0
    earMin.current = 1
    blinkPhase.current = 'calibrate'
    calibrationFrames.current = 0
    earSum.current = 0
    yawBaseline.current = null
    yawCalFrames.current = 0
    yawSum.current = 0
    
    setPhase('challenge')
    setInstruction('Get ready...')
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
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        
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

  const getChallengeLabel = (c: string) => {
    switch(c) { case 'blink': return '👁️ Blink'; case 'left': return '← Left'; case 'right': return 'Right →'; default: return c }
  }

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

        {phase === 'challenge' && challengesRef.current.length > 0 && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
            {step + 1}/3: {getChallengeLabel(challengesRef.current[step])}
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
          {/* Step indicators */}
          <div className="flex gap-1 mb-2">
            {challengesRef.current.map((c, i) => (
              <div key={i} className={`flex-1 h-2 rounded ${
                i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : 'bg-gray-700'
              }`} />
            ))}
          </div>
          
          {/* Progress bar */}
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-150" 
              style={{ width: `${progress}%` }} 
            />
          </div>
          
          {/* Metric display */}
          {metric.label && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>{metric.label}</span>
              <span className={Number(metric.value) >= metric.target ? 'text-green-400 font-bold' : ''}>
                {metric.value}{metric.unit} / {metric.target}{metric.unit}
              </span>
            </div>
          )}
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
