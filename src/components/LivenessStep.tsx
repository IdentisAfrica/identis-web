import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
const MOUTH_INDICES = [61, 291, 13, 14]
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454

interface Props {
  verificationId: string
  onNext: () => void
}

type ChallengeType = 'blink' | 'smile' | 'turnLeft' | 'turnRight'
type StepType = 'init' | 'loading' | 'ready' | 'challenge' | 'verifying' | 'success' | 'failed'

interface FaceMetrics {
  leftEAR: number
  rightEAR: number
  mouthRatio: number
  headTurn: number
  movement: number
  textureVariance: number
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceMeshRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const animationRef = useRef<number | null>(null)
  
  const [step, setStep] = useState<StepType>('init')
  const [error, setError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [progress, setProgress] = useState(0)
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | null>(null)
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [faceDetected, setFaceDetected] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  
  const challengeOrderRef = useRef<ChallengeType[]>([])
  const challengeHoldFramesRef = useRef(0)
  const completedChallengesRef = useRef<ChallengeType[]>([])
  const selfieRef = useRef<string | null>(null)
  
  const metricsHistoryRef = useRef<FaceMetrics[]>([])
  const baselineMetricsRef = useRef<FaceMetrics | null>(null)
  const spoofScoreRef = useRef(0)
  const lastLandmarksRef = useRef<any>(null)

  const REQUIRED_HOLD_FRAMES = 8
  const CHALLENGES_REQUIRED = 4
  const MIN_SPOOF_SCORE = 0.6

  useEffect(() => {
    const challenges: ChallengeType[] = ['blink', 'smile', 'turnLeft', 'turnRight']
    challengeOrderRef.current = challenges.sort(() => Math.random() - 0.5)
  }, [])

  const calculateEAR = (landmarks: any, eyeIndices: number[]): number => {
    if (!landmarks || landmarks.length === 0) return 0
    const getPoint = (idx: number) => landmarks[idx]
    const p = eyeIndices.map(i => getPoint(i))
    const v1 = Math.sqrt(Math.pow(p[1].x - p[5].x, 2) + Math.pow(p[1].y - p[5].y, 2))
    const v2 = Math.sqrt(Math.pow(p[2].x - p[4].x, 2) + Math.pow(p[2].y - p[4].y, 2))
    const h = Math.sqrt(Math.pow(p[0].x - p[3].x, 2) + Math.pow(p[0].y - p[3].y, 2))
    return h > 0 ? (v1 + v2) / (2.0 * h) : 0
  }

  const calculateMouthRatio = (landmarks: any): number => {
    if (!landmarks || landmarks.length === 0) return 0
    const left = landmarks[MOUTH_INDICES[0]]
    const right = landmarks[MOUTH_INDICES[1]]
    const top = landmarks[MOUTH_INDICES[2]]
    const bottom = landmarks[MOUTH_INDICES[3]]
    const width = Math.sqrt(Math.pow(right.x - left.x, 2) + Math.pow(right.y - left.y, 2))
    const height = Math.sqrt(Math.pow(bottom.x - top.x, 2) + Math.pow(bottom.y - top.y, 2))
    return width > 0 ? height / width : 0
  }

  const calculateHeadTurn = (landmarks: any): number => {
    if (!landmarks || landmarks.length === 0) return 0
    const nose = landmarks[NOSE_TIP]
    const leftCheek = landmarks[LEFT_CHEEK]
    const rightCheek = landmarks[RIGHT_CHEEK]
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x)
    const noseOffset = nose.x - (leftCheek.x + faceWidth / 2)
    return faceWidth > 0 ? noseOffset / faceWidth : 0
  }

  const calculateMovement = (currentLandmarks: any): number => {
    if (!lastLandmarksRef.current || !currentLandmarks) return 0
    let totalMovement = 0
    const checkPoints = [NOSE_TIP, LEFT_CHEEK, RIGHT_CHEEK, 10, 152]
    checkPoints.forEach(idx => {
      const curr = currentLandmarks[idx]
      const prev = lastLandmarksRef.current[idx]
      if (curr && prev) {
        totalMovement += Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2))
      }
    })
    return totalMovement / checkPoints.length
  }

  const calculateTextureVariance = (): number => {
    if (!canvasRef.current) return 0
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx || !videoRef.current) return 0
    canvasRef.current.width = 100
    canvasRef.current.height = 100
    ctx.drawImage(videoRef.current, 0, 0, 100, 100)
    const imageData = ctx.getImageData(0, 0, 100, 100)
    const data = imageData.data
    let sum = 0
    let sumSq = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
      sum += gray
      sumSq += gray * gray
      count++
    }
    const mean = sum / count
    const variance = (sumSq / count) - (mean * mean)
    return Math.min(variance / 2000, 1)
  }

  const calculateVariance = (values: number[]): number => {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  }

  const calculateSpoofScore = (): number => {
    const history = metricsHistoryRef.current
    if (history.length < 10) return 0
    const recentMovements = history.slice(-20).map(m => m.movement)
    const avgMovement = recentMovements.reduce((a, b) => a + b, 0) / recentMovements.length
    const movementScore = Math.min(avgMovement * 50, 1)
    const recentTexture = history.slice(-10).map(m => m.textureVariance)
    const avgTexture = recentTexture.reduce((a, b) => a + b, 0) / recentTexture.length
    const textureScore = avgTexture > 0.3 ? 1 : avgTexture / 0.3
    const earValues = history.slice(-30).map(m => (m.leftEAR + m.rightEAR) / 2)
    const earVariance = calculateVariance(earValues)
    const earScore = Math.min(earVariance * 100, 1)
    const headValues = history.slice(-20).map(m => m.headTurn)
    const headVariance = calculateVariance(headValues)
    const headScore = Math.min(headVariance * 50, 1)
    return (movementScore * 0.3 + textureScore * 0.3 + earScore * 0.2 + headScore * 0.2)
  }

  const getChallengeInstruction = (challenge: ChallengeType): string => {
    switch (challenge) {
      case 'blink': return 'Blink your eyes'
      case 'smile': return 'Smile widely'
      case 'turnLeft': return 'Turn your head LEFT'
      case 'turnRight': return 'Turn your head RIGHT'
      default: return ''
    }
  }

  const onFaceResults = useCallback((results: any) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setFaceDetected(false)
      setDebugInfo('No face detected')
      return
    }
    const landmarks = results.multiFaceLandmarks[0]
    setFaceDetected(true)
    const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES)
    const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES)
    const mouthRatio = calculateMouthRatio(landmarks)
    const headTurn = calculateHeadTurn(landmarks)
    const movement = calculateMovement(landmarks)
    const textureVariance = calculateTextureVariance()
    const metrics: FaceMetrics = { leftEAR, rightEAR, mouthRatio, headTurn, movement, textureVariance }
    metricsHistoryRef.current.push(metrics)
    if (metricsHistoryRef.current.length > 60) {
      metricsHistoryRef.current.shift()
    }
    spoofScoreRef.current = calculateSpoofScore()
    if (metricsHistoryRef.current.length === 10 && !baselineMetricsRef.current) {
      baselineMetricsRef.current = { ...metrics }
    }
    lastLandmarksRef.current = landmarks
    setDebugInfo('EAR: ' + ((leftEAR + rightEAR) / 2).toFixed(3) + ' | Mouth: ' + mouthRatio.toFixed(3) + ' | Turn: ' + headTurn.toFixed(3) + ' | Spoof: ' + spoofScoreRef.current.toFixed(2))
    if (step === 'challenge' && currentChallenge) {
      processChallenge(metrics)
    }
  }, [step, currentChallenge])

  const processChallenge = (metrics: FaceMetrics) => {
    const baseline = baselineMetricsRef.current
    if (!baseline) return
    let detected = false
    const avgEAR = (metrics.leftEAR + metrics.rightEAR) / 2
    const baselineEAR = (baseline.leftEAR + baseline.rightEAR) / 2
    switch (currentChallenge) {
      case 'blink':
        if (avgEAR < baselineEAR * 0.6) detected = true
        break
      case 'smile':
        if (metrics.mouthRatio > baseline.mouthRatio * 1.5) detected = true
        break
      case 'turnLeft':
        if (metrics.headTurn < -0.15) detected = true
        break
      case 'turnRight':
        if (metrics.headTurn > 0.15) detected = true
        break
    }
    if (detected) {
      challengeHoldFramesRef.current++
      setProgress((challengeHoldFramesRef.current / REQUIRED_HOLD_FRAMES) * 100)
      if (challengeHoldFramesRef.current >= REQUIRED_HOLD_FRAMES) {
        completedChallengesRef.current.push(currentChallenge!)
        challengeHoldFramesRef.current = 0
        setProgress(0)
        if (completedChallengesRef.current.length === CHALLENGES_REQUIRED) {
          captureSelfie()
          verifyLiveness()
        } else {
          const nextIndex = challengeIndex + 1
          setChallengeIndex(nextIndex)
          setCurrentChallenge(challengeOrderRef.current[nextIndex])
          setInstruction(getChallengeInstruction(challengeOrderRef.current[nextIndex]))
        }
      }
    } else {
      if (challengeHoldFramesRef.current > 0) {
        challengeHoldFramesRef.current = Math.max(0, challengeHoldFramesRef.current - 2)
        setProgress((challengeHoldFramesRef.current / REQUIRED_HOLD_FRAMES) * 100)
      }
    }
  }

  const captureSelfie = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, 640, 480)
      selfieRef.current = canvas.toDataURL('image/jpeg', 0.8)
    }
  }

  const initMediaPipe = async () => {
    setStep('loading')
    setInstruction('Loading face detection...')
    try {
      const FaceMesh = (window as any).FaceMesh
      const Camera = (window as any).Camera
      if (!FaceMesh || !Camera) {
        throw new Error('MediaPipe not loaded')
      }
      faceMeshRef.current = new FaceMesh({
        locateFile: (file: string) => 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file
      })
      faceMeshRef.current.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      faceMeshRef.current.onResults(onFaceResults)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        cameraRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (faceMeshRef.current && videoRef.current) {
              await faceMeshRef.current.send({ image: videoRef.current })
            }
          },
          width: 640,
          height: 480
        })
        await cameraRef.current.start()
        setStep('ready')
        setInstruction('Position your face in the frame')
      }
    } catch (err: any) {
      console.error('MediaPipe init error:', err)
      setError(err.message || 'Failed to initialize face detection')
      setStep('failed')
    }
  }

  const startChallenges = () => {
    if (!faceDetected) {
      setError('Please position your face in the frame first')
      return
    }
    completedChallengesRef.current = []
    challengeHoldFramesRef.current = 0
    setChallengeIndex(0)
    setCurrentChallenge(challengeOrderRef.current[0])
    setInstruction(getChallengeInstruction(challengeOrderRef.current[0]))
    setStep('challenge')
    setProgress(0)
  }

  const verifyLiveness = async () => {
    setStep('verifying')
    setInstruction('Verifying...')
    const spoofScore = spoofScoreRef.current
    if (spoofScore < MIN_SPOOF_SCORE) {
      setError('Liveness check failed. Please try again with better lighting. Score: ' + spoofScore.toFixed(2))
      setStep('failed')
      return
    }
    try {
      const response = await fetch(API_URL + '/api/verification/' + verificationId + '/liveness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfie: selfieRef.current,
          livenessScore: spoofScore,
          challengesCompleted: completedChallengesRef.current,
          antiSpoofScore: spoofScore,
          metricsSnapshot: {
            avgMovement: metricsHistoryRef.current.slice(-20).reduce((a, m) => a + m.movement, 0) / 20,
            avgTextureVariance: metricsHistoryRef.current.slice(-10).reduce((a, m) => a + m.textureVariance, 0) / 10,
            challengeCount: completedChallengesRef.current.length
          }
        })
      })
      if (response.ok) {
        setStep('success')
        setInstruction('Liveness verified!')
        setTimeout(onNext, 1500)
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Verification failed')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify liveness')
      setStep('failed')
    }
  }

  useEffect(() => {
    return () => {
      if (cameraRef.current) cameraRef.current.stop()
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  const faceIndicatorClass = faceDetected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
  const readyButtonClass = faceDetected ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/25' : 'bg-gray-700 text-gray-400 cursor-not-allowed'

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Liveness Check</h2>
        <p className="text-gray-400">Complete the challenges to verify you are real</p>
      </div>
      <div className="relative aspect-[4/3] max-w-md mx-auto rounded-2xl overflow-hidden bg-gray-900 border-2 border-gray-700">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} className="hidden" />
        <div className={'absolute top-4 left-4 px-3 py-1 rounded-full text-sm font-medium ' + faceIndicatorClass}>
          {faceDetected ? 'Face detected' : 'Position your face'}
        </div>
        {step === 'challenge' && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-center text-white mb-2">
              <span className="text-2xl">{instruction}</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-100" style={{ width: progress + '%' }} />
            </div>
            <div className="text-center text-gray-400 text-sm mt-2">
              Challenge {challengeIndex + 1} of {CHALLENGES_REQUIRED}
            </div>
          </div>
        )}
        {step === 'loading' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white">{instruction}</p>
            </div>
          </div>
        )}
        {step === 'success' && (
          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">✓</span>
              </div>
              <p className="text-white text-xl font-bold">Verified!</p>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center">
          {error}
        </div>
      )}
      {step !== 'challenge' && step !== 'loading' && step !== 'success' && (
        <p className="text-center text-gray-300">{instruction}</p>
      )}
      {step === 'init' && (
        <button onClick={initMediaPipe} className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25">
          Start Camera
        </button>
      )}
      {step === 'ready' && (
        <button onClick={startChallenges} disabled={!faceDetected} className={'w-full py-4 rounded-xl font-semibold text-lg transition-all ' + readyButtonClass}>
          {faceDetected ? 'Start Liveness Check' : 'Position your face first'}
        </button>
      )}
      {step === 'failed' && (
        <button onClick={() => { setError(''); setStep('init'); metricsHistoryRef.current = []; baselineMetricsRef.current = null; spoofScoreRef.current = 0 }} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold text-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/25">
          Try Again
        </button>
      )}
      <p className="text-center text-gray-500 text-xs">
        Anti-spoofing protection active - Photos and videos will be rejected
      </p>
    </div>
  )
}