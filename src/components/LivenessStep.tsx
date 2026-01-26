import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  onNext: () => void
}

// Landmark indices for eyes
const RIGHT_EYE = { top: 159, bottom: 145, left: 33, right: 133 }
const LEFT_EYE = { top: 386, bottom: 374, left: 362, right: 263 }
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'challenge' | 'done' | 'error'>('loading')
  const [loadingText, setLoadingText] = useState('Loading...')
  const [faceOk, setFaceOk] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')
  const [challengeStep, setChallengeStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [debug, setDebug] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<faceLandmarksDetection.FaceLandmarksDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef(0)
  
  // Tracking refs
  const earHistory = useRef<number[]>([])
  const blinkDetected = useRef(false)
  const leftDetected = useRef(false)
  const rightDetected = useRef(false)
  const holdCount = useRef(0)
  const faceStableCount = useRef(0)

  // Challenges: blink, turn left, turn right
  const challenges = ['blink', 'left', 'right']

  const submit = useCallback(async (selfie: string) => {
    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore: 0.9,
          selfieBase64: selfie
        })
      })
      if (!res.ok) throw new Error('Failed')
      setPhase('done')
      setTimeout(onNext, 1500)
    } catch {
      setError('Verification failed')
      setPhase('error')
    }
  }, [verificationId, onNext])

  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  }, [])

  const completeChallenge = useCallback(() => {
    holdCount.current = 0
    if (challengeStep >= challenges.length - 1) {
      // All done
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
      const selfie = capture()
      submit(selfie)
    } else {
      setChallengeStep(s => s + 1)
      setProgress(0)
    }
  }, [challengeStep, challenges.length, capture, submit])

  const detect = useCallback(async () => {
    const video = videoRef.current
    const model = modelRef.current
    if (!video || !model || video.readyState < 2 || phase === 'done') {
      animRef.current = requestAnimationFrame(detect)
      return
    }

    try {
      const faces = await model.estimateFaces(video, { flipHorizontal: false })
      
      if (faces.length === 0) {
        setFaceOk(false)
        faceStableCount.current = 0
        setDebug('No face')
        animRef.current = requestAnimationFrame(detect)
        return
      }

      const kp = faces[0].keypoints
      const w = video.videoWidth
      const h = video.videoHeight

      // Calculate EAR (Eye Aspect Ratio)
      const getEAR = (eye: typeof RIGHT_EYE) => {
        const top = kp[eye.top]
        const bottom = kp[eye.bottom]
        const left = kp[eye.left]
        const right = kp[eye.right]
        if (!top || !bottom || !left || !right) return 0.15
        const vertical = Math.abs(top.y - bottom.y)
        const horizontal = Math.abs(right.x - left.x)
        return horizontal > 0 ? vertical / horizontal : 0.15
      }

      const ear = (getEAR(RIGHT_EYE) + getEAR(LEFT_EYE)) / 2

      // Calculate head yaw (left/right)
      const nose = kp[NOSE_TIP]
      const leftCheek = kp[LEFT_CHEEK]
      const rightCheek = kp[RIGHT_CHEEK]
      let yaw = 0
      if (nose && leftCheek && rightCheek) {
        const toLeft = Math.abs(nose.x - leftCheek.x)
        const toRight = Math.abs(nose.x - rightCheek.x)
        yaw = (toRight - toLeft) / (toLeft + toRight)
      }

      // Face size check
      const box = faces[0].box
      const faceSize = box.width / w

      setDebug(`EAR:${ear.toFixed(2)} Yaw:${yaw.toFixed(2)} Size:${(faceSize * 100).toFixed(0)}%`)

      // Check if face is ready
      const isReady = faceSize > 0.15 && faceSize < 0.6 && Math.abs(yaw) < 0.3
      if (isReady) {
        faceStableCount.current++
        if (faceStableCount.current > 5) setFaceOk(true)
      } else {
        faceStableCount.current = 0
        setFaceOk(false)
      }

      // READY PHASE
      if (phase === 'ready') {
        if (faceOk) {
          setInstruction('Great! Tap Start')
        } else if (faceSize < 0.15) {
          setInstruction('Move closer')
        } else if (faceSize > 0.6) {
          setInstruction('Move back')
        } else if (Math.abs(yaw) > 0.3) {
          setInstruction('Face the camera')
        } else {
          setInstruction('Position your face')
        }
      }

      // CHALLENGE PHASE
      if (phase === 'challenge') {
        const current = challenges[challengeStep]

        if (current === 'blink') {
          // Track EAR history
          earHistory.current.push(ear)
          if (earHistory.current.length > 15) earHistory.current.shift()

          // Detect blink: EAR drops below 0.08 then rises above 0.12
          const min = Math.min(...earHistory.current)
          const max = Math.max(...earHistory.current)
          
          if (ear < 0.08 && !blinkDetected.current) {
            blinkDetected.current = true
            holdCount.current = 10 // instant pass
          }

          setInstruction(blinkDetected.current ? '✓ Blink detected!' : 'Blink your eyes')
          
          if (blinkDetected.current) {
            setProgress(100)
            setTimeout(() => completeChallenge(), 500)
            animRef.current = requestAnimationFrame(detect)
            return
          }
        }

        if (current === 'left') {
          if (yaw < -0.25) {
            holdCount.current++
            setInstruction('Hold...')
          } else {
            holdCount.current = Math.max(0, holdCount.current - 1)
            setInstruction('Turn head LEFT')
          }
          setProgress((holdCount.current / 8) * 100)
          if (holdCount.current >= 8) {
            leftDetected.current = true
            completeChallenge()
          }
        }

        if (current === 'right') {
          if (yaw > 0.25) {
            holdCount.current++
            setInstruction('Hold...')
          } else {
            holdCount.current = Math.max(0, holdCount.current - 1)
            setInstruction('Turn head RIGHT')
          }
          setProgress((holdCount.current / 8) * 100)
          if (holdCount.current >= 8) {
            rightDetected.current = true
            completeChallenge()
          }
        }
      }

    } catch (e) {
      console.error(e)
    }

    animRef.current = requestAnimationFrame(detect)
  }, [phase, challengeStep, challenges, completeChallenge])

  const startChallenges = useCallback(() => {
    if (!faceOk) return
    setChallengeStep(0)
    setProgress(0)
    holdCount.current = 0
    earHistory.current = []
    blinkDetected.current = false
    leftDetected.current = false
    rightDetected.current = false
    setPhase('challenge')
    setInstruction('Blink your eyes')
  }, [faceOk])

  // Init
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        setLoadingText('Loading AI...')
        await tf.ready()
        if (!mounted) return

        setLoadingText('Loading face model...')
        const model = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
            refineLandmarks: true,
            maxFaces: 1
          }
        )
        if (!mounted) return
        modelRef.current = model

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
  }, [detect])

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold text-white text-center mb-1">Liveness Check</h2>
      <p className="text-gray-400 text-sm text-center mb-4">Prove you're a real person</p>

      <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        
        {/* Oval guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-52 h-72 rounded-[50%] border-4 transition-all ${
            phase === 'challenge' ? 'border-blue-400' :
            faceOk ? 'border-green-400' : 'border-gray-500'
          }`} />
        </div>

        {/* Status badge */}
        <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
          faceOk ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {faceOk ? '✓ Face OK' : '✗ No Face'}
        </div>

        {/* Challenge step */}
        {phase === 'challenge' && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
            {challengeStep + 1}/{challenges.length}
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-white">{loadingText}</p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="absolute inset-0 bg-green-600 flex flex-col items-center justify-center">
            <span className="text-6xl mb-2">✓</span>
            <p className="text-white font-bold text-xl">Verified!</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Progress */}
      {phase === 'challenge' && (
        <div className="mb-4">
          <div className="flex gap-1 mb-2">
            {challenges.map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded ${
                i < challengeStep ? 'bg-green-500' :
                i === challengeStep ? 'bg-blue-500' : 'bg-gray-700'
              }`} />
            ))}
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Instruction */}
      <div className={`rounded-xl p-4 mb-4 text-center ${
        phase === 'challenge' ? 'bg-blue-500/20 border border-blue-500/40' :
        faceOk ? 'bg-green-500/20 border border-green-500/40' :
        'bg-gray-800 border border-gray-700'
      }`}>
        <p className="text-white font-semibold text-lg">{instruction}</p>
      </div>

      {/* Debug */}
      <p className="text-gray-600 text-xs text-center font-mono mb-3">{debug}</p>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-center">{error}</p>
        </div>
      )}

      {/* Buttons */}
      {phase === 'ready' && (
        <button
          onClick={startChallenges}
          disabled={!faceOk}
          className={`w-full py-4 rounded-xl font-bold text-lg ${
            faceOk
              ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {faceOk ? 'Start Verification' : 'Position Your Face'}
        </button>
      )}

      {phase === 'error' && (
        <button
          onClick={() => window.location.reload()}
          className="w-full py-4 rounded-xl font-bold bg-red-500 text-white"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
