import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { recordStart, recordChunk, recordStop, getMeeting, BACKEND_PORT } from '../services/api'
import { connectTranscribeWS } from '../services/websocket'
import { toast } from '../services/toast'
import { formatTime } from '../services/transcriptDoc'

interface RecordingPanelProps {
  onComplete: (jobId: string, filename: string) => void
}

export function RecordingPanel({ onComplete }: RecordingPanelProps) {
  const {
    recordingJobId, setRecordingJobId,
    recordingState, setRecordingState,
    setRecordingMode,
    liveSegments, setLiveSegments,
    addMeeting,
  } = useAppStore()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunkIndexRef = useRef<number>(0)
  const cycleTimerRef = useRef<number>(0)
  const elapsedTimerRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)       // 本次暂停的起点
  const pauseAccumRef = useRef<number>(0)        // 累计已暂停的毫秒数
  const recordingStateRef = useRef<'idle' | 'recording' | 'paused' | 'processing'>('idle')
  const recordingJobIdRef = useRef<string | null>(null)

  const [volume, setVolume] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  // 录音核心：开麦克风 → MediaRecorder（每段独立）→ 3 秒切一段上传
  const beginRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      streamRef.current = stream

      // 音量分析
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser

      const tickVolume = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteTimeDomainData(data)
        // 简单 RMS
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        setVolume(Math.min(1, rms * 3))
        requestAnimationFrame(tickVolume)
      }
      requestAnimationFrame(tickVolume)

      // 启动录音会话
      const { job_id } = await recordStart()
      // 关键：ref 必须同步设置，否则 startCycle 看到 stale ref 会立刻 return
      recordingJobIdRef.current = job_id
      recordingStateRef.current = 'recording'
      setRecordingJobId(job_id)
      setRecordingState('recording')

      // 计时器
      startTimeRef.current = Date.now()
      pauseStartRef.current = 0
      pauseAccumRef.current = 0
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current - pauseAccumRef.current) / 1000))
      }, 250)

      // 连 WebSocket 接收实时 segments
      connectTranscribeWS(
        job_id,
        () => {},  // progress
        (segment) => {
          // 实时推 segments
          const cur = useAppStore.getState().liveSegments
          useAppStore.getState().setLiveSegments([...cur, segment])
        },
        (result) => {
          // 完整 ASR 完成：拿到完整 segments（带说话人），切换到会议视图
          setRecordingState('idle')
          setRecordingMode(false)
          cleanup(false)
          // 加到会议列表 + 设为当前
          getMeeting(job_id).then((detail: any) => {
            addMeeting({
              id: detail.id,
              filename: detail.filename,
              duration: detail.duration || 0,
              transcript: detail.transcript || '',
              minutes: '',
              segments: Array.isArray(detail.segments) ? detail.segments : [],
              chatHistory: [],
              created_at: detail.created_at,
            })
            toast('录音完成，已生成完整转录', 'success')
          }).catch((e) => toast(`获取录音结果失败: ${e.message}`, 'error'))
        },
        (err) => {
          toast(`录音处理失败: ${err}`, 'error')
          setRecordingState('idle')
          setRecordingMode(false)
          cleanup(false)
        },
      )

      // 启动第一个 cycle（此时 ref 已就绪）
      startCycle(stream)
    } catch (e: any) {
      toast(`无法访问麦克风: ${e.message || '请在系统设置中授权'}`, 'error')
      setRecordingMode(false)
    }
  }, [])

  // 一个 cycle：MediaRecorder 录 3 秒 → 停 → 上传 → 立即开下一个 cycle
  const startCycle = useCallback((stream: MediaStream) => {
    if (recordingStateRef.current !== 'recording') return

    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    const localChunks: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size > 0) localChunks.push(e.data) }
    mr.onstop = () => {
      if (localChunks.length === 0) return
      const blob = new Blob(localChunks, { type: 'audio/webm' })
      const idx = chunkIndexRef.current++
      const jobId = recordingJobIdRef.current
      if (jobId) {
        recordChunk(jobId, blob, idx).catch((e) => console.warn('chunk upload failed', e))
      }
      // 排下一个 cycle
      if (recordingStateRef.current === 'recording') {
        cycleTimerRef.current = window.setTimeout(() => startCycle(stream), 100)
      }
    }
    mediaRecorderRef.current = mr
    mr.start()
    // 3 秒后自动 stop
    cycleTimerRef.current = window.setTimeout(() => {
      if (mr.state === 'recording') mr.stop()
    }, 3000)
  }, [])

  recordingStateRef.current = recordingState
  recordingJobIdRef.current = recordingJobId

  // 暂停
  const handlePause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (cycleTimerRef.current) { clearTimeout(cycleTimerRef.current); cycleTimerRef.current = 0 }
    pauseStartRef.current = Date.now()
    // 同步设置 ref，避免 onstop 回调里误判为还在 recording 又排下个 cycle
    recordingStateRef.current = 'paused'
    setRecordingState('paused')
  }, [])

  // 继续
  const handleResume = useCallback(() => {
    if (pauseStartRef.current) {
      pauseAccumRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = 0
    }
    // 同步设置 ref，避免 startCycle 看到 stale 'paused' 而提前 return
    recordingStateRef.current = 'recording'
    setRecordingState('recording')
    if (streamRef.current) startCycle(streamRef.current)
  }, [startCycle])

  // 停止：合并 → 完整 ASR → ws 推 complete
  const handleStop = useCallback(async () => {
    if (!recordingJobIdRef.current) return
    // 停掉当前 cycle
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (cycleTimerRef.current) { clearTimeout(cycleTimerRef.current); cycleTimerRef.current = 0 }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = 0 }

    // 同步设置 ref，阻止 onstop 回调里再排下个 cycle
    recordingStateRef.current = 'processing'
    setRecordingState('processing')
    try {
      // 留 500ms 让最后一段 chunk 上传
      await new Promise(r => setTimeout(r, 500))
      await recordStop(recordingJobIdRef.current)
      // 后续等待 ws 推 complete，会自动切换到会议视图
    } catch (e: any) {
      toast(`停止录音失败: ${e.message}`, 'error')
      recordingStateRef.current = 'idle'
      setRecordingState('idle')
      setRecordingMode(false)
      cleanup(false)
    }
  }, [])

  // 取消（放弃这次录音）
  const handleCancel = useCallback(() => {
    if (!confirm('放弃本次录音？已识别内容将丢弃')) return
    cleanup(true)
    recordingStateRef.current = 'idle'
    setRecordingState('idle')
    setRecordingMode(false)
    setLiveSegments([])
  }, [])

  const cleanup = (cancel: boolean) => {
    if (cycleTimerRef.current) { clearTimeout(cycleTimerRef.current); cycleTimerRef.current = 0 }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = 0 }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
    if (cancel) setLiveSegments([])
  }

  // 自动启动录音（组件 mount 后）
  useEffect(() => {
    beginRecording()
    return () => {
      // 退出时清理（但保留已识别数据）
      if (audioCtxRef.current) cleanup(false)
    }
  }, [])

  const totalChars = liveSegments.reduce((n, s) => n + (s.text?.length || 0), 0)
  const lastSeg = liveSegments[liveSegments.length - 1]

  return (
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',background:'#0f0f12'}}>
      {/* 顶部：录音状态条 */}
      <div style={{padding:'24px 32px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          {/* 状态点 */}
          <div style={{
            width:'12px',height:'12px',borderRadius:'50%',
            background: recordingState === 'recording' ? '#ef4444' : (recordingState === 'paused' ? '#fbbf24' : '#60a5fa'),
            animation: recordingState === 'recording' ? 'pulse 1s infinite' : 'none',
            boxShadow: recordingState === 'recording' ? '0 0 12px rgba(239,68,68,0.6)' : 'none',
          }} />
          <div>
            <div style={{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,0.9)'}}>
              {recordingState === 'recording' && '录音中'}
              {recordingState === 'paused' && '已暂停'}
              {recordingState === 'processing' && '处理中…'}
              {recordingState === 'idle' && '准备中'}
            </div>
            <div style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>
              {recordingState === 'recording' && '实时识别中（不带说话人），停止后将做完整说话人分离'}
              {recordingState === 'paused' && '点击继续恢复录音'}
              {recordingState === 'processing' && '正在合并音频并跑完整 ASR，请稍候'}
            </div>
          </div>
        </div>
        <div style={{fontSize:'32px',fontFamily:'ui-monospace,monospace',color:'rgba(255,255,255,0.9)',fontVariantNumeric:'tabular-nums'}}>
          {formatTime(elapsedSec)}
        </div>
      </div>

      {/* 音量条 */}
      <div style={{padding:'8px 32px',display:'flex',alignItems:'center',gap:'12px',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
        <span style={{fontSize:'10px',color:'rgba(255,255,255,0.3)',width:'40px'}}>音量</span>
        <div style={{flex:1,height:'6px',background:'rgba(255,255,255,0.05)',borderRadius:'3px',overflow:'hidden'}}>
          <div style={{
            width: `${volume * 100}%`, height:'100%',
            background: volume > 0.6 ? 'linear-gradient(90deg, #fbbf24, #ef4444)' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            transition:'width 0.08s',
          }} />
        </div>
      </div>

      {/* 实时转录区 */}
      <div style={{flex:1,overflowY:'auto',padding:'24px 32px'}}>
        {liveSegments.length === 0 ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'12px'}}>
            <div style={{width:'40px',height:'40px',border:'2px solid rgba(255,255,255,0.1)',borderTop:'2px solid #60a5fa',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
            <p style={{color:'rgba(255,255,255,0.3)',fontSize:'13px',margin:0}}>等待说话…</p>
          </div>
        ) : (
          <>
            {liveSegments.map((seg, i) => {
              const isLast = i === liveSegments.length - 1 && recordingState === 'recording'
              return (
                <div key={i} style={{
                  marginBottom:'10px',padding:'10px 14px',borderRadius:'10px',
                  background: isLast ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)',
                  borderLeft: isLast ? '3px solid #60a5fa' : '3px solid transparent',
                  fontSize:'13px',lineHeight:1.7,
                  color: isLast ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)',
                  transition:'background 0.2s',
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                    <span style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',fontFamily:'monospace'}}>{formatTime(seg.start)}</span>
                    <span style={{fontSize:'10px',color:'#fbbf24'}}>{seg.speaker}</span>
                    {isLast && <span style={{fontSize:'9px',color:'#60a5fa',background:'rgba(96,165,250,0.15)',padding:'1px 6px',borderRadius:'99px'}}>实时</span>}
                  </div>
                  <p style={{margin:0}}>{seg.text}</p>
                </div>
              )
            })}
            <div style={{textAlign:'center',padding:'8px',fontSize:'10px',color:'rgba(255,255,255,0.2)'}}>
              已识别 {liveSegments.length} 段 · {totalChars} 字
            </div>
          </>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{padding:'18px 32px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'center',gap:'10px'}}>
        {recordingState === 'recording' && (
          <>
            <button onClick={handlePause} style={btnStyle('#fbbf24', 'rgba(251,191,36,0.15)', 'rgba(251,191,36,0.3)')}>⏸ 暂停</button>
            <button onClick={handleStop} style={btnStyle('#fff', 'rgba(239,68,68,0.3)', '#ef4444')}>⏹ 停止并生成转录</button>
          </>
        )}
        {recordingState === 'paused' && (
          <>
            <button onClick={handleResume} style={btnStyle('#fff', 'rgba(52,211,153,0.3)', '#34d399')}>▶ 继续录音</button>
            <button onClick={handleStop} style={btnStyle('#fff', 'rgba(239,68,68,0.3)', '#ef4444')}>⏹ 停止并生成转录</button>
            <button onClick={handleCancel} style={btnStyle('rgba(255,255,255,0.5)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)')}>放弃</button>
          </>
        )}
        {recordingState === 'processing' && (
          <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 20px',color:'rgba(255,255,255,0.6)',fontSize:'12px'}}>
            <div style={{width:'14px',height:'14px',border:'2px solid rgba(255,255,255,0.15)',borderTop:'2px solid #60a5fa',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
            正在生成完整转录（带说话人分离）...
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

const btnStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
  padding:'10px 22px',
  fontSize:'13px',
  fontWeight:500,
  color,
  background:bg,
  border:`1px solid ${border}`,
  borderRadius:'10px',
  cursor:'pointer',
})
