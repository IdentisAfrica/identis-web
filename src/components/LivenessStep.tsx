import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as blazeface from '@tensorflow-models/blazeface'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props { verificationId: string; onNext: () => void }
interface FaceBox { topLeft: [number, number]; bottomRight: [number, number]; probability: number }

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Loading...')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'init'|'ready'|'checking'|'complete'|'failed'>('init')
  const [instruction, setInstruction] = useState('Initializing...')
  const [faceDetected, setFaceDetected] = useState(false)
  const [progress, setProgress] = useState(0)
  const [debug, setDebug] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<blazeface.BlazeFaceModel|null>(null)
  const streamRef = useRef<MediaStream|null>(null)
  const animRef = useRef<number|null>(null)
  const challengeIdx = useRef(0)
  const holdFrames = useRef(0)
  const completed = useRef<string[]>([])
  const selfie = useRef<string|null>(null)

  const challenges = ['center', 'closer', 'turn']
  const challengeNames: Record<string,string> = { center: '🎯 Center your face', closer: '🔍 Move closer', turn: '↔️ Turn head slightly' }

  const submitResult = useCallback(async (score: number) => {
    try {
      await fetch(API_URL + '/api/verify/liveness', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, livenessScore: score, selfieBase64: selfie.current })
      })
      setTimeout(() => onNext(), 1500)
    } catch { setError('Failed to save'); setStep('failed') }
  }, [verificationId, onNext])

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !modelRef.current || step === 'complete' || step === 'failed') {
      animRef.current = requestAnimationFrame(processFrame); return
    }
    const video = videoRef.current
    if (video.readyState < 2) { animRef.current = requestAnimationFrame(processFrame); return }
    
    try {
      const preds = await modelRef.current.estimateFaces(video, false)
      if (preds.length === 0 || (preds[0] as FaceBox).probability < 0.8) {
        setFaceDetected(false); setDebug('No face'); animRef.current = requestAnimationFrame(processFrame); return
      }
      const face = preds[0] as FaceBox
      setFaceDetected(true)
      const [x1,y1] = face.topLeft, [x2,y2] = face.bottomRight
      const cx = (x1+x2)/2/video.videoWidth, cy = (y1+y2)/2/video.videoHeight
      const size = Math.max((x2-x1)/video.videoWidth, (y2-y1)/video.videoHeight)
      setDebug('Face: ' + (face.probability*100).toFixed(0) + '% Size: ' + (size*100).toFixed(0) + '%')

      if (step === 'checking') {
        const ch = challenges[challengeIdx.current]
        let pass = false
        if (ch === 'center') pass = Math.abs(cx-0.5) < 0.15 && Math.abs(cy-0.5) < 0.15 && size > 0.15
        else if (ch === 'closer') pass = size > 0.3
        else if (ch === 'turn') pass = Math.abs(cx-0.5) > 0.1
        
        if (pass) {
          holdFrames.current++
          setInstruction(challengeNames[ch] + ' - Hold (' + holdFrames.current + '/6)')
          if (holdFrames.current >= 6) {
            completed.current.push(ch)
            challengeIdx.current++
            holdFrames.current = 0
            setProgress((challengeIdx.current/challenges.length)*100)
            if (challengeIdx.current >= challenges.length) {
              if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d')
                if (ctx) { canvasRef.current.width = video.videoWidth; canvasRef.current.height = video.videoHeight; ctx.drawImage(video,0,0); selfie.current = canvasRef.current.toDataURL('image/jpeg',0.8) }
              }
              setStep('complete'); setInstruction('✓ Complete!'); submitResult(0.85)
              return
            }
            setInstruction(challengeNames[challenges[challengeIdx.current]])
          }
        } else {
          holdFrames.current = Math.max(0, holdFrames.current-1)
          setInstruction(challengeNames[ch])
        }
      }
    } catch (e) { console.error(e) }
    animRef.current = requestAnimationFrame(processFrame)
  }, [step, submitResult])

  const startCheck = useCallback(() => {
    if (!faceDetected) return
    challengeIdx.current = 0; holdFrames.current = 0; completed.current = []
    setStep('checking'); setProgress(0); setInstruction(challengeNames[challenges[0]])
  }, [faceDetected])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        setLoadingMsg('Loading TensorFlow...')
        await tf.ready()
        if (!mounted) return
        setLoadingMsg('Loading model...')
        modelRef.current = await blazeface.load()
        if (!mounted) return
        setLoadingMsg('Starting camera...')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
        if (!mounted) { stream.getTracks().forEach(t=>t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        setLoading(false); setStep('ready'); setInstruction('Position face and tap Start')
        animRef.current = requestAnimationFrame(processFrame)
      } catch (e) { setError('Init failed: ' + (e as Error).message); setLoading(false) }
    }
    init()
    return () => { mounted = false; if (animRef.current) cancelAnimationFrame(animRef.current); streamRef.current?.getTracks().forEach(t=>t.stop()) }
  }, [processFrame])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 20, color: '#1e3a5f' }}>Liveness Check</h2>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '60%', height: '75%', border: '3px solid ' + (faceDetected ? '#22c55e' : '#ef4444'), borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, padding: '6px 12px', borderRadius: 20, background: faceDetected ? '#22c55e' : '#ef4444', color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{faceDetected ? '✓ Face' : '✗ No face'}</div>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', color: '#fff' }}><p>{loadingMsg}</p></div>}
        {step === 'complete' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.9)' }}><span style={{ fontSize: 80 }}>✓</span></div>}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {step === 'checking' && <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, marginBottom: 15 }}><div style={{ width: progress + '%', height: '100%', background: '#22c55e' }} /></div>}
      <p style={{ textAlign: 'center', fontSize: 18, fontWeight: 500, marginBottom: 15 }}>{instruction}</p>
      {error && <p style={{ textAlign: 'center', color: '#dc2626', marginBottom: 15 }}>{error}</p>}
      <p style={{ textAlign: 'center', fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{debug}</p>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 15 }}>
        {step === 'ready' && <button onClick={startCheck} disabled={!faceDetected} style={{ padding: '14px 32px', fontSize: 16, fontWeight: 'bold', color: '#fff', background: faceDetected ? '#1e3a5f' : '#9ca3af', border: 'none', borderRadius: 8, cursor: faceDetected ? 'pointer' : 'not-allowed' }}>Start</button>}
        {step === 'failed' && <button onClick={() => { setStep('ready'); setError('') }} style={{ padding: '14px 32px', fontSize: 16, fontWeight: 'bold', color: '#fff', background: '#dc2626', border: 'none', borderRadius: 8 }}>Retry</button>}
      </div>
    </div>
  )
}
