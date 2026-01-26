import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

// =============================================================================
// TYPES
// =============================================================================
interface Props {
  verificationId: string
  onNext: () => void
}

interface FaceLandmarks {
  keypoints: Array<{ x: number; y: number; z?: number; name?: string }>
  box: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number }
}

type ChallengeType = 'blink' | 'turnLeft' | 'turnRight' | 'nod'
type Phase = 'loading' | 'ready' | 'challenge' | 'capturing' | 'submitting' | 'success' | 'failed'

interface ChallengeConfig {
  type: ChallengeType
  instruction: string
  icon: string
}

// =============================================================================
// FACIAL LANDMARK INDICES (MediaPipe Face Mesh 468 points)
// =============================================================================
// Right eye
const RIGHT_EYE_TOP = 159
const RIGHT_EYE_BOTTOM = 145
const RIGHT_EYE_LEFT = 33
const RIGHT_EYE_RIGHT = 133

// Left eye  
const LEFT_EYE_TOP = 386
const LEFT_EYE_BOTTOM = 374
const LEFT_EYE_LEFT = 362
const LEFT_EYE_RIGHT = 263

// Nose and face reference points
const NOSE_TIP = 1
const NOSE_BRIDGE = 6
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454
const CHIN = 152
const FOREHEAD = 10

// =============================================================================
// ANTI-SPOOF UTILITIES
// =============================================================================

// Eye Aspect Ratio - detects blinks
function calculateEAR(landmarks: Array<{ x: number; y: number }>, eyeIndices: {
  top: number, bottom: number, left: number, right: number
}): number {
  const top = landmarks[eyeIndices.top]
  const bottom = landmarks[eyeIndices.bottom]
  const left = landmarks[eyeIndices.left]
  const right = landmarks[eyeIndices.right]
  
  if (!top || !bottom || !left || !right) return 0.3
  
  const vertical = Math.abs(top.y - bottom.y)
  const horizontal = Math.abs(right.x - left.x)
  
  return horizontal > 0 ? vertical / horizontal : 0.3
}

// Head pose estimation from landmarks
function estimateHeadPose(landmarks: Array<{ x: number; y: number }>, frameWidth: number, frameHeight: number): {
  yaw: number    // left/right rotation (-1 to 1)
  pitch: number  // up/down rotation (-1 to 1)
  centered: boolean
} {
  const nose = landmarks[NOSE_TIP]
  const leftCheek = landmarks[LEFT_CHEEK]
  const rightCheek = landmarks[RIGHT_CHEEK]
  const forehead = landmarks[FOREHEAD]
  const chin = landmarks[CHIN]
  
  if (!nose || !leftCheek || !rightCheek || !forehead || !chin) {
    return { yaw: 0, pitch: 0, centered: false }
  }
  
  // Yaw: compare distances from nose to each cheek
  const noseToLeft = Math.abs(nose.x - leftCheek.x)
  const noseToRight = Math.abs(nose.x - rightCheek.x)
  const totalWidth = noseToLeft + noseToRight
  const yaw = totalWidth > 0 ? (noseToRight - noseToLeft) / totalWidth : 0
  
  // Pitch: nose position relative to forehead-chin line
  const faceCenterY = (forehead.y + chin.y) / 2
  const faceHeight = Math.abs(chin.y - forehead.y)
  const pitch = faceHeight > 0 ? (nose.y - faceCenterY) / (faceHeight / 2) : 0
  
  // Check if face is roughly centered in frame
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2
  const normalizedX = faceCenterX / frameWidth
  const normalizedY = nose.y / frameHeight
  const centered = normalizedX > 0.3 && normalizedX < 0.7 && normalizedY > 0.25 && normalizedY < 0.75
  
  return { 
    yaw: Math.max(-1, Math.min(1, yaw * 2)),
    pitch: Math.max(-1, Math.min(1, pitch)),
    centered 
  }
}

// Generate random challenge sequence
function generateChallenges(): ChallengeConfig[] {
  const allChallenges: ChallengeConfig[] = [
    { type: 'blink', instruction: 'Blink your eyes', icon: '😑' },
    { type: 'turnLeft', instruction: 'Turn head LEFT', icon: '👈' },
    { type: 'turnRight', instruction: 'Turn head RIGHT', icon: '👉' },
  ]
  
  // Shuffle and pick 3
  const shuffled = allChallenges.sort(() => Math.random() - 0.5)
  
  // Always start with blink (hardest for photos)
  const blink = shuffled.find(c => c.type === 'blink')!
  const others = shuffled.filter(c => c.type !== 'blink').slice(0, 2)
  
  return [blink, ...others]
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function LivenessStep({ verificationId, onNext }: Props) {
  // State
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadingText, setLoadingText] = useState('Initializing...')
  const [loadingPercent, setLoadingPercent] = useState(0)
  const [error, setError] = useState('')
  
  const [challenges, setChallenges] = useState<ChallengeConfig[]>([])
  const [currentChallenge, setCurrentChallenge] = useState(0)
  const [challengeProgress, setChallengeProgress] = useState(0)
  const [instruction, setInstruction] = useState('')
  
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceReady, setFaceReady] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<faceLandmarksDetection.FaceLandmarksDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  
  // Anti-spoof tracking
  const blinkState = useRef<'open' | 'closing' | 'closed' | 'opening'>('open')
  const blinkCount = useRef(0)
  const lastEAR = useRef(0.3)
  const holdFrames = useRef(0)
  const capturedFrames = useRef<string[]>([])
  const reactionTimes = useRef<number[]>([])
  const challengeStartTime = useRef(0)
  const consecutiveDetections = useRef(0)

  // =============================================================================
  // SUBMIT VERIFICATION
  // =============================================================================
  const submitVerification = useCallback(async () => {
    setPhase('submitting')
    setInstruction('Verifying...')
    
    try {
      // Calculate confidence score based on anti-spoof signals
      const avgReactionTime = reactionTimes.current.length > 0
        ? reactionTimes.current.reduce((a, b) => a + b, 0) / reactionTimes.current.length
        : 1000
      
      // Human reaction: 300-1500ms, Photos/videos: instant or very slow
      const reactionScore = avgReactionTime > 200 && avgReactionTime < 2000 ? 0.9 : 0.5
      const blinkScore = blinkCount.current >= 1 ? 0.95 : 0.6
      const livenessScore = (reactionScore + blinkScore) / 2
      
      // Use the middle captured frame (most likely during active challenge)
      const bestFrame = capturedFrames.current[Math.floor(capturedFrames.current.length / 2)] || capturedFrames.current[0]
      
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore,
          selfieBase64: bestFrame,
          antiSpoofData: {
            blinkDetected: blinkCount.current >= 1,
            avgReactionTime,
            challengesCompleted: currentChallenge + 1,
            captureCount: capturedFrames.current.length
          }
        })
      })
      
      if (!res.ok) throw new Error('Server error')
      
      setPhase('success')
      setInstruction('Verified!')
      
      // Stop camera
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animFrameRef.current)
      
      setTimeout(onNext, 1500)
      
    } catch (e) {
      setError('Verification failed. Please try again.')
      setPhase('failed')
    }
  }, [verificationId, onNext, currentChallenge])

  // =============================================================================
  // CAPTURE FRAME
  // =============================================================================
  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.85)
    capturedFrames.current.push(frame)
    
    // Keep only last 5 frames
    if (capturedFrames.current.length > 5) {
      capturedFrames.current.shift()
    }
  }, [])

  // =============================================================================
  // PROCESS FRAME - Main detection loop
  // =============================================================================
  const processFrame = useCallback(async () => {
    const video = videoRef.current
    const model = modelRef.current
    
    if (!video || !model || video.readyState < 2 || phase === 'success' || phase === 'submitting') {
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    try {
      const faces = await model.estimateFaces(video, { flipHorizontal: false })
      
      if (faces.length === 0) {
        consecutiveDetections.current = 0
        setFaceDetected(false)
        setFaceReady(false)
        setDebugInfo('No face detected')
        holdFrames.current = 0
        setChallengeProgress(0)
        animFrameRef.current = requestAnimationFrame(processFrame)
        return
      }

      const face = faces[0] as FaceLandmarks
      const landmarks = face.keypoints
      const box = face.box
      
      consecutiveDetections.current++
      setFaceDetected(consecutiveDetections.current >= 3)
      
      // Calculate face metrics
      const rightEAR = calculateEAR(landmarks, {
        top: RIGHT_EYE_TOP, bottom: RIGHT_EYE_BOTTOM,
        left: RIGHT_EYE_LEFT, right: RIGHT_EYE_RIGHT
      })
      const leftEAR = calculateEAR(landmarks, {
        top: LEFT_EYE_TOP, bottom: LEFT_EYE_BOTTOM,
        left: LEFT_EYE_LEFT, right: LEFT_EYE_RIGHT
      })
      const avgEAR = (rightEAR + leftEAR) / 2
      
      const pose = estimateHeadPose(landmarks, video.videoWidth, video.videoHeight)
      
      // Face size check (should be 15-60% of frame width)
      const faceSize = box.width / video.videoWidth
      const goodSize = faceSize > 0.15 && faceSize < 0.6
      
      setDebugInfo(`EAR:${avgEAR.toFixed(2)} Yaw:${pose.yaw.toFixed(2)} Size:${(faceSize*100).toFixed(0)}%`)
      
      // ===================
      // READY PHASE
      // ===================
      if (phase === 'ready') {
        const isReady = consecutiveDetections.current >= 5 && pose.centered && goodSize
        setFaceReady(isReady)
        
        if (isReady) {
          setInstruction('Perfect! Tap Start when ready')
        } else if (!goodSize) {
          setInstruction(faceSize < 0.15 ? 'Move closer to camera' : 'Move back a bit')
        } else if (!pose.centered) {
          setInstruction('Center your face in the oval')
        } else {
          setInstruction('Hold still...')
        }
      }
      
      // ===================
      // CHALLENGE PHASE
      // ===================
      if (phase === 'challenge' && challenges.length > 0) {
        const challenge = challenges[currentChallenge]
        let passed = false
        
        // Capture frames during challenges (for anti-spoof evidence)
        if (Math.random() < 0.1) { // ~10% of frames
          captureFrame()
        }
        
        switch (challenge.type) {
          case 'blink':
            // Blink detection state machine
            const EAR_THRESHOLD = 0.28
            const wasOpen = lastEAR.current > EAR_THRESHOLD
            const isNowClosed = avgEAR < EAR_THRESHOLD
            
            if (blinkState.current === 'open' && isNowClosed) {
              blinkState.current = 'closing'
            } else if (blinkState.current === 'closing' && isNowClosed) {
              blinkState.current = 'closed'
            } else if (blinkState.current === 'closed' && !isNowClosed) {
              blinkState.current = 'opening'
            } else if (blinkState.current === 'opening' && !isNowClosed) {
              // Complete blink detected!
              blinkState.current = 'open'
              blinkCount.current++
              passed = true
              
              // Record reaction time
              const reactionTime = Date.now() - challengeStartTime.current
              reactionTimes.current.push(reactionTime)
            }
            
            lastEAR.current = avgEAR
            setInstruction(avgEAR < EAR_THRESHOLD ? 'Good! Now open your eyes' : 'Blink your eyes')
            break
            
          case 'turnLeft':
            passed = pose.yaw < -0.3
            setInstruction(passed ? 'Hold it...' : 'Turn your head LEFT')
            break
            
          case 'turnRight':
            passed = pose.yaw > 0.3
            setInstruction(passed ? 'Hold it...' : 'Turn your head RIGHT')
            break
            
          case 'nod':
            passed = pose.pitch > 0.25 || pose.pitch < -0.25
            setInstruction('Nod your head up and down')
            break
        }
        
        // Progress tracking
        if (passed) {
          holdFrames.current++
          const required = challenge.type === 'blink' ? 1 : 8
          setChallengeProgress((holdFrames.current / required) * 100)
          
          if (holdFrames.current >= required) {
            // Challenge complete!
            const reactionTime = Date.now() - challengeStartTime.current
            if (challenge.type !== 'blink') {
              reactionTimes.current.push(reactionTime)
            }
            
            // Capture frame at challenge completion
            captureFrame()
            
            holdFrames.current = 0
            setChallengeProgress(0)
            
            if (currentChallenge >= challenges.length - 1) {
              // All challenges complete!
              submitVerification()
              return
            } else {
              // Next challenge
              setCurrentChallenge(c => c + 1)
              challengeStartTime.current = Date.now()
              blinkState.current = 'open'
            }
          }
        } else {
          holdFrames.current = Math.max(0, holdFrames.current - 0.5)
          setChallengeProgress((holdFrames.current / 8) * 100)
        }
      }

    } catch (e) {
      console.error('Detection error:', e)
    }

    animFrameRef.current = requestAnimationFrame(processFrame)
  }, [phase, challenges, currentChallenge, captureFrame, submitVerification])

  // =============================================================================
  // START CHALLENGES
  // =============================================================================
  const startChallenges = useCallback(() => {
    if (!faceReady) return
    
    const newChallenges = generateChallenges()
    setChallenges(newChallenges)
    setCurrentChallenge(0)
    setChallengeProgress(0)
    holdFrames.current = 0
    blinkState.current = 'open'
    blinkCount.current = 0
    reactionTimes.current = []
    capturedFrames.current = []
    challengeStartTime.current = Date.now()
    
    setPhase('challenge')
    setInstruction(newChallenges[0].instruction)
  }, [faceReady])

  // =============================================================================
  // RETRY
  // =============================================================================
  const retry = useCallback(() => {
    setPhase('ready')
    setError('')
    setChallengeProgress(0)
    setCurrentChallenge(0)
    holdFrames.current = 0
    animFrameRef.current = requestAnimationFrame(processFrame)
  }, [processFrame])

  // =============================================================================
  // INITIALIZE
  // =============================================================================
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        // Load TensorFlow
        setLoadingText('Loading AI engine...')
        setLoadingPercent(10)
        await tf.ready()
        await tf.setBackend('webgl')
        if (!mounted) return
        
        // Load face landmarks model
        setLoadingText('Loading face detection model...')
        setLoadingPercent(40)
        
        const model = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'mediapipe', solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
            refineLandmarks: true,
            maxFaces: 1
          }
        )
        if (!mounted) return
        modelRef.current = model
        
        // Start camera
        setLoadingText('Starting camera...')
        setLoadingPercent(70)
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        })
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        
        // Connect video
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
        
        setLoadingPercent(100)
        setPhase('ready')
        setInstruction('Position your face in the oval')
        
        // Start detection loop
        animFrameRef.current = requestAnimationFrame(processFrame)
        
      } catch (e) {
        console.error('Init error:', e)
        const msg = (e as Error).message
        if (msg.includes('Permission denied') || msg.includes('NotAllowed')) {
          setError('Camera access denied. Please allow camera access.')
        } else {
          setError('Failed to initialize: ' + msg)
        }
        setPhase('failed')
      }
    }

    init()

    return () => {
      mounted = false
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [processFrame])

  // =============================================================================
  // RENDER
  // =============================================================================
  const currentChallengeData = challenges[currentChallenge]

  return (
    <div className="max-w-md mx-auto p-4">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white">Liveness Verification</h2>
        <p className="text-gray-400 text-sm">Complete the challenges to prove you're real</p>
      </div>

      {/* Camera View */}
      <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Face guide oval */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-52 h-72 rounded-[50%] border-4 transition-all duration-300 ${
            phase === 'challenge' ? 'border-blue-400 animate-pulse' :
            faceReady ? 'border-green-400' :
            faceDetected ? 'border-yellow-400' :
            'border-gray-500'
          }`} />
        </div>

        {/* Status badge */}
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-bold ${
          faceReady ? 'bg-green-500 text-white' :
          faceDetected ? 'bg-yellow-500 text-black' :
          'bg-red-500 text-white'
        }`}>
          {faceReady ? '✓ Ready' : faceDetected ? '◐ Adjust' : '✗ No Face'}
        </div>

        {/* Challenge counter */}
        {phase === 'challenge' && (
          <div className="absolute top-3 right-3 bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs font-bold">
            {currentChallenge + 1} / {challenges.length}
          </div>
        )}

        {/* Loading overlay */}
        {phase === 'loading' && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6">
            <div className="w-16 h-16 mb-4 relative">
              <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
            </div>
            <p className="text-white font-medium mb-3">{loadingText}</p>
            <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300" 
                style={{ width: `${loadingPercent}%` }} 
              />
            </div>
          </div>
        )}

        {/* Submitting overlay */}
        {phase === 'submitting' && (
          <div className="absolute inset-0 bg-blue-900/95 flex flex-col items-center justify-center">
            <div className="w-14 h-14 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-white font-semibold text-lg">Verifying...</p>
            <p className="text-blue-200 text-sm mt-1">Analyzing liveness data</p>
          </div>
        )}

        {/* Success overlay */}
        {phase === 'success' && (
          <div className="absolute inset-0 bg-green-600 flex flex-col items-center justify-center">
            <div className="text-7xl mb-3">✓</div>
            <p className="text-white font-bold text-2xl">Verified!</p>
            <p className="text-green-100 text-sm mt-1">Liveness confirmed</p>
          </div>
        )}

        {/* Capturing flash effect */}
        {phase === 'capturing' && (
          <div className="absolute inset-0 bg-white/30 animate-pulse" />
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Challenge Progress */}
      {phase === 'challenge' && (
        <div className="mb-4">
          {/* Challenge steps */}
          <div className="flex gap-1.5 mb-3">
            {challenges.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  i < currentChallenge ? 'bg-green-500' :
                  i === currentChallenge ? 'bg-blue-500' :
                  'bg-gray-700'
                }`}
              />
            ))}
          </div>
          {/* Current challenge progress */}
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all duration-150"
              style={{ width: `${challengeProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Instruction Card */}
      <div className={`rounded-xl p-5 mb-4 text-center transition-all ${
        phase === 'challenge' ? 'bg-blue-600/20 border-2 border-blue-500/50' :
        faceReady ? 'bg-green-600/20 border-2 border-green-500/50' :
        'bg-gray-800 border-2 border-gray-700'
      }`}>
        {phase === 'challenge' && currentChallengeData && (
          <div className="text-4xl mb-2">{currentChallengeData.icon}</div>
        )}
        <p className={`font-semibold text-lg ${
          phase === 'challenge' ? 'text-blue-200' : 'text-white'
        }`}>
          {instruction}
        </p>
        {phase === 'ready' && !faceReady && (
          <p className="text-gray-400 text-sm mt-1">Make sure you're in a well-lit area</p>
        )}
      </div>

      {/* Debug info (can be removed in production) */}
      <p className="text-gray-600 text-xs text-center font-mono mb-3">{debugInfo}</p>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-center">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {phase === 'ready' && (
          <button
            onClick={startChallenges}
            disabled={!faceReady}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              faceReady
                ? 'bg-gradient-to-r from-blue-600 to-green-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {faceReady ? 'Start Verification' : 'Position Your Face'}
          </button>
        )}

        {phase === 'failed' && (
          <button
            onClick={retry}
            className="w-full py-4 rounded-xl font-bold text-lg bg-red-600 text-white hover:bg-red-700 transition"
          >
            Try Again
          </button>
        )}
      </div>

      {/* Security note */}
      {phase === 'ready' && (
        <p className="text-center text-gray-500 text-xs mt-4">
          🔒 Your data is encrypted and never stored after verification
        </p>
      )}
    </div>
  )
}
