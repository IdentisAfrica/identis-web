import { useState, useRef, useEffect } from 'react'
import * as faceapi from '@vladmandic/face-api'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

interface Props {
  verificationId: string
  onNext: () => void
}

// 68-point landmark indices
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

// Shuffle array (randomize challenge order)
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
  const [debug, setDebug] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef(0)
  const phaseRef = useRef(phase)
  const stepRef = useRef(step)
  
  // Tracking
  const stableCount = useRef(0)
  const challengeComplete = useRef(false)
  const holdFrames = useRef(0)
  
  // Anti-spoofing: track timing
  const challengeStartTime = useRef(0)
  const actionTimes = useRef<number[]>([])
  
  // Anti-spoofing: track face consistency
  const facePositions = useRef<{x: number, y: number}[]>([])
  const faceSizes = useRef<number[]>([])
  
  // Blink detection
  const earValues = useRef<number[]>([])
  const blinkState = useRef<'waiting' | 'closed' | 'done'>('waiting')
  const blinkCount = useRef(0)
  
  // Head turn
  const yawValues = useRef<number[]>([])
  const baselineYaw = useRef(0)
  
  // Randomized challenges
  const [challenges, setChallenges] = useState<string[]>([])

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { stepRef.current = step }, [step])

  // Anti-spoofing check: natural micro-movements
  const hasNaturalMovement = (): boolean => {
    if (facePositions.current.length < 20) return true // Not enough data
    
    // Calculate variance in face position
    const positions = facePositions.current.slice(-20)
    const avgX = positions.reduce((a, b) => a + b.x, 0) / positions.length
    const avgY = positions.reduce((a, b) => a + b.y, 0) / positions.length
    
    let variance = 0
    positions.forEach(p => {
      variance += Math.pow(p.x - avgX, 2) + Math.pow(p.y - avgY, 2)
    })
    variance /= positions.length
    
    // Real faces have micro-movements (variance > 0.5)
    // Photos are too stable (variance < 0.1)
    return variance > 0.3
  }
  
  // Anti-spoofing check: human reaction time (200-800ms is normal)
  const hasHumanTiming = (): boolean => {
    if (actionTimes.current.length < 2) return true
    
    const avgReaction = actionTimes.current.reduce((a, b) => a + b, 0) / actionTimes.current.length
    // Too fast (<150ms) = bot, too slow (>5000ms) = suspicious
    return avgReaction > 150 && avgReaction < 5000
  }

  const submit = async (selfie: string) => {
    // Final anti-spoofing validation
    const naturalMovement = hasNaturalMovement()
    const humanTiming = hasHumanTiming()
    
    // Calculate liveness score based on checks
    let livenessScore = 0.5 // Base score for completing challenges
    if (naturalMovement) livenessScore += 0.25
    if (humanTiming) livenessScore += 0.25
    if (blinkCount.current >= 1) livenessScore += 0.1 // Bonus for confirmed blinks
    
    livenessScore = Math.min(1.0, livenessScore)
    
    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          verificationId, 
          livenessScore,
          selfieBase64: selfie,
          // Include anti-spoofing metadata
          metadata: {
            naturalMovement,
            humanTiming,
            blinkCount: blinkCount.current,
            avgReactionMs: actionTimes.current.length > 0 
              ? actionTimes.current.reduce((a, b) => a + b, 0) / actionTimes.current.length 
              : 0
          }
        })
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
    // Record timing for this challenge
    const elapsed = Date.now() - challengeStartTime.current
    actionTimes.current.push(elapsed)
    
    // Reset tracking
    holdFrames.current = 0
    challengeComplete.current = false
    earValues.current = []
    blinkState.current = 'waiting'
    yawValues.current = []
    baselineYaw.current = 0
    setProgress(0)
    
    if (stepRef.current >= challenges.length - 1) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
      submit(capture())
    } else {
      setStep(s => s + 1)
      challengeStartTime.current = Date.now()
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
        setDebug('No face - look at camera')
        animRef.current = requestAnimationFrame(detect)
        return
      }

      const landmarks = detection.landmarks.positions
      const box = detection.detection.box
      const faceW = box.width / video.videoWidth
      const goodSize = faceW > 0.2 && faceW < 0.7

      // Track face position for anti-spoofing
      const faceCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      facePositions.current.push(faceCenter)
      if (facePositions.current.length > 60) facePositions.current.shift()
      
      faceSizes.current.push(faceW)
      if (faceSizes.current.length > 30) faceSizes.current.shift()

      // Calculate EAR
      const leftEyePoints = LEFT_EYE.map(i => landmarks[i])
      const rightEyePoints = RIGHT_EYE.map(i => landmarks[i])
      const leftEAR = calculateEAR(leftEyePoints)
      const rightEAR = calculateEAR(rightEyePoints)
      const avgEAR = (leftEAR + rightEAR) / 2

      // Calculate head yaw
      const nose = landmarks[NOSE_TIP]
      const leftFace = landmarks[LEFT_FACE]
      const rightFace = landmarks[RIGHT_FACE]
      const faceWidth = rightFace.x - leftFace.x
      const noseRatio = (nose.x - leftFace.x) / faceWidth
      const yaw = (noseRatio - 0.5) * 90

      // Update face status
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

      // === READY PHASE ===
      if (currentPhase === 'ready') {
        setDebug(`EAR: ${avgEAR.toFixed(2)} | Yaw: ${yaw.toFixed(0)}°`)
        if (!goodSize) {
          setInstruction(faceW < 0.2 ? 'Move closer' : 'Move back')
        } else if (stableCount.current > 5) {
          setInstruction('')
        } else {
          setInstruction('Hold still...')
        }
      }

      // === CHALLENGE PHASE ===
      if (currentPhase === 'challenge' && !challengeComplete.current && challenges.length > 0) {
        const current = challenges[currentStep]

        // ==================
        // BLINK DETECTION
        // ==================
        if (current === 'blink') {
          earValues.current.push(avgEAR)
          if (earValues.current.length > 60) earValues.current.shift()
          
          if (earValues.current.length < 8) {
            setDebug(`Calibrating... ${earValues.current.length}/8`)
            setInstruction('Look at camera...')
          } else {
            const baseline = earValues.current.slice(0, 8).reduce((a, b) => a + b, 0) / 8
            const threshold = baseline * 0.70 // 30% drop = blink
            
            setDebug(`EAR: ${avgEAR.toFixed(2)} | Base: ${baseline.toFixed(2)}`)
            
            if (blinkState.current === 'waiting') {
              setInstruction('Blink your eyes!')
              if (avgEAR < threshold) {
                blinkState.current = 'closed'
                setProgress(50)
              }
            } else if (blinkState.current === 'closed') {
              setInstruction('Now open!')
              if (avgEAR > baseline * 0.85) {
                blinkState.current = 'done'
                blinkCount.current++
                challengeComplete.current = true
                setProgress(100)
                setInstruction('Blink detected! ✓')
                setTimeout(nextStep, 300)
              }
            }
          }
        }

        // ==================
        // TURN LEFT
        // ==================
        else if (current === 'left') {
          // Establish baseline yaw
          if (yawValues.current.length < 5) {
            yawValues.current.push(yaw)
            baselineYaw.current = yawValues.current.reduce((a, b) => a + b, 0) / yawValues.current.length
            setDebug(`Calibrating yaw...`)
            setInstruction('Face forward...')
          } else {
            // Need to turn 20° from baseline
            const turnAmount = yaw - baselineYaw.current
            setDebug(`Turn: ${turnAmount.toFixed(0)}° (need +20°)`)
            
            const passed = turnAmount > 18
            
            if (passed) {
              holdFrames.current++
              const pct = Math.min(100, (holdFrames.current / 8) * 100)
              setProgress(pct)
              setInstruction('Hold...')
              
              if (holdFrames.current >= 8) {
                challengeComplete.current = true
                setInstruction('Good! ✓')
                setTimeout(nextStep, 300)
              }
            } else {
              holdFrames.current = Math.max(0, holdFrames.current - 1)
              setProgress((holdFrames.current / 8) * 100)
              setInstruction('Turn head LEFT ←')
            }
          }
        }

        // ==================
        // TURN RIGHT
        // ==================
        else if (current === 'right') {
          if (yawValues.current.length < 5) {
            yawValues.current.push(yaw)
            baselineYaw.current = yawValues.current.reduce((a, b) => a + b, 0) / yawValues.current.length
            setDebug(`Calibrating yaw...`)
            setInstruction('Face forward...')
          } else {
            const turnAmount = yaw - baselineYaw.current
            setDebug(`Turn: ${turnAmount.toFixed(0)}° (need -20°)`)
            
            const passed = turnAmount < -18
            
            if (passed) {
              holdFrames.current++
              const pct = Math.min(100, (holdFrames.current / 8) * 100)
              setProgress(pct)
              setInstruction('Hold...')
              
              if (holdFrames.current >= 8) {
                challengeComplete.current = true
                setInstruction('Good! ✓')
                setTimeout(nextStep, 300)
              }
            } else {
              holdFrames.current = Math.max(0, holdFrames.current - 1)
              setProgress((holdFrames.current / 8) * 100)
              setInstruction('Turn head RIGHT →')
            }
          }
        }

        // ==================
        // SMILE (bonus challenge)
        // ==================
        else if (current === 'smile') {
          // Use mouth landmarks to detect smile
          const mouthLeft = landmarks[48]
          const mouthRight = landmarks[54]
          const mouthTop = landmarks[51]
          const mouthBottom = landmarks[57]
          
          const mouthWidth = Math.hypot(mouthRight.x - mouthLeft.x, mouthRight.y - mouthLeft.y)
          const mouthHeight = Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y)
          const mouthRatio = mouthWidth / (mouthHeight + 0.001)
          
          setDebug(`Mouth ratio: ${mouthRatio.toFixed(2)} (need >4)`)
          
          // Smile = wide mouth, ratio > 4
          const isSmiling = mouthRatio > 3.5
          
          if (isSmiling) {
            holdFrames.current++
            const pct = Math.min(100, (holdFrames.current / 10) * 100)
            setProgress(pct)
            setInstruction('Hold that smile!')
            
            if (holdFrames.current >= 10) {
              challengeComplete.current = true
              setInstruction('Great smile! ✓')
              setTimeout(nextStep, 300)
            }
          } else {
            holdFrames.current = Math.max(0, holdFrames.current - 1)
            setProgress((holdFrames.current / 10) * 100)
            setInstruction('Smile! 😊')
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
    
    // Randomize challenge order for anti-spoofing
    const randomChallenges = shuffle(['blink', 'left', 'right'])
    setChallenges(randomChallenges)
    
    // Reset everything
    setStep(0)
    setProgress(0)
    holdFrames.current = 0
    challengeComplete.current = false
    earValues.current = []
    blinkState.current = 'waiting'
    blinkCount.current = 0
    yawValues.current = []
    baselineYaw.current = 0
    facePositions.current = []
    faceSizes.current = []
    actionTimes.current = []
    challengeStartTime.current = Date.now()
    
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

  // Get display name for current challenge
  const getChallengeDisplay = (c: string) => {
    switch(c) {
      case 'blink': return 'Blink'
      case 'left': return 'Turn Left'
      case 'right': return 'Turn Right'
      case 'smile': return 'Smile'
      default: return c
    }
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

        {phase === 'challenge' && challenges.length > 0 && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
            {step + 1}/{challenges.length}: {getChallengeDisplay(challenges[step])}
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

      {phase === 'challenge' && challenges.length > 0 && (
        <div className="mb-4">
          <div className="flex gap-1 mb-2">
            {challenges.map((c, i) => (
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
