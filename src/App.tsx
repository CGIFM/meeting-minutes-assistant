import { useState, useCallback } from 'react'
import { useAppStore } from './stores/appStore'
import { Sidebar } from './components/Sidebar'
import { DropZone } from './components/DropZone'
import { TranscriptPanel } from './components/TranscriptPanel'
import { MinutesPanel } from './components/MinutesPanel'
import { ProgressBar } from './components/ProgressBar'
import { SettingsModal } from './components/SettingsModal'
import { GenerateDialog } from './components/GenerateDialog'
import { Onboarding } from './components/Onboarding'
import { uploadAudio } from './services/api'
import { connectTranscribeWS, ChatWebSocket } from './services/websocket'

export default function App() {
  const store = useAppStore()
  const [chatWs, setChatWs] = useState<ChatWebSocket | null>(null)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [pendingMeetingId, setPendingMeetingId] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  const port = store.backendPort || (window as any).__BACKEND_PORT__ || 0

  const handleFileDrop = useCallback(async (file: File) => {
    store.setTranscribing(true)
    store.setTranscribeProgress(0.05)

    try {
      const { job_id, filename } = await uploadAudio(file)

      const newMeeting = {
        id: job_id,
        filename,
        duration: 0,
        transcript: '',
        minutes: '',
        segments: [],
        chatHistory: [],
        created_at: new Date().toISOString(),
      }
      store.addMeeting(newMeeting)

      connectTranscribeWS(
        port,
        job_id,
        (progress) => store.setTranscribeProgress(progress),
        (segment) => {
          const meeting = store.currentMeeting
          if (meeting) {
            store.updateMeeting(job_id, {
              segments: [...(meeting.segments || []), segment],
            })
          }
        },
        (result) => {
          store.setTranscribing(false)
          store.setTranscribeProgress(1)
          store.updateMeeting(job_id, {
            transcript: result.full_text,
            segments: result.segments,
          })
          // 转录完成后弹出确认对话框
          setPendingMeetingId(job_id)
          setShowGenerateDialog(true)
        },
        (error) => {
          store.setTranscribing(false)
          alert(`转录失败: ${error}`)
        },
      )
    } catch (e: any) {
      store.setTranscribing(false)
      alert(`上传失败: ${e.message}`)
    }
  }, [port, store])

  const handleGenerate = useCallback(async (options: { provider: string; model: string; customPrompt: string }) => {
    setShowGenerateDialog(false)
    const meeting = store.meetings.find(m => m.id === pendingMeetingId) || store.currentMeeting
    if (!meeting?.transcript) return

    // 清空旧纪要
    store.updateMeeting(pendingMeetingId, { minutes: '' })
    store.setGenerating(true)

    const ws = new ChatWebSocket(port, (data) => {
      if (data.type === 'chunk') {
        const currentMeeting = store.currentMeeting
        store.updateMeeting(pendingMeetingId, {
          minutes: (currentMeeting?.minutes || '') + data.content,
        })
      } else if (data.type === 'done') {
        store.setGenerating(false)
        store.updateMeeting(pendingMeetingId, { minutes: data.full_content })
      } else if (data.type === 'error') {
        store.setGenerating(false)
        alert(`生成失败: ${data.message}`)
      }
    })

    await ws.connect()
    setChatWs(ws)

    ws.send({
      action: 'summarize',
      meeting_id: pendingMeetingId,
      transcript: meeting.transcript,
      provider: options.provider,
      model: options.model,
      custom_prompt: options.customPrompt,
    })
  }, [pendingMeetingId, port, store])

  const handleChat = useCallback((message: string) => {
    if (!store.currentMeeting) return

    const meeting = store.currentMeeting
    store.updateMeeting(meeting.id, {
      chatHistory: [...meeting.chatHistory, { role: 'user', content: message }],
    })
    store.setGenerating(true)

    let responseText = ''
    const ws = new ChatWebSocket(port, (data) => {
      if (data.type === 'chunk') {
        responseText += data.content
        store.updateMeeting(meeting.id, {
          chatHistory: [
            ...meeting.chatHistory,
            { role: 'user', content: message },
            { role: 'assistant', content: responseText },
          ],
        })
      } else if (data.type === 'done') {
        store.setGenerating(false)
      } else if (data.type === 'error') {
        store.setGenerating(false)
      }
    })

    ws.connect().then(() => {
      ws.send({
        action: 'chat',
        meeting_id: meeting.id,
        message,
        provider: store.settings.default_provider,
        model: store.settings.default_model,
        history: [
          { role: 'assistant', content: meeting.minutes },
          ...meeting.chatHistory,
        ],
      })
      setChatWs(ws)
    })
  }, [chatWs, port, store])

  const currentMeeting = store.currentMeeting

  // 启动时检测首次使用
  useState(() => {
    setTimeout(async () => {
      try {
        const resp = await fetch(`http://127.0.0.1:${(window as any).__BACKEND_PORT__}/api/settings/apikeys`)
        const keys = await resp.json()
        const configured = keys.claude?.configured || keys.openai?.configured || keys.gemini?.configured
        if (!configured) {
          setShowOnboarding(true)
        }
      } catch {}
    }, 500)
  })

  return (
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',background:'#0f0f12'}}>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Sidebar onFileDrop={handleFileDrop} />

        <main style={{flex:1,display:'flex',overflow:'hidden',borderTopLeftRadius:'16px',background:'#1a1a22'}}>
          {currentMeeting ? (
            <>
              <TranscriptPanel audioUrl={`${(window as any).__BACKEND_PORT__ ? `http://127.0.0.1:${(window as any).__BACKEND_PORT__}` : ''}/api/audio/${currentMeeting.id}/${encodeURIComponent(currentMeeting.filename)}`} />
              <MinutesPanel onChat={handleChat} onRegenerate={() => { setPendingMeetingId(currentMeeting.id); setShowGenerateDialog(true) }} />
            </>
          ) : (
            <DropZone onFileDrop={handleFileDrop} />
          )}
        </main>
      </div>

      {(store.isTranscribing || store.isGenerating) && <ProgressBar />}

      {showGenerateDialog && currentMeeting && (
        <GenerateDialog
          transcript={currentMeeting.transcript}
          meetingId={currentMeeting.id}
          onConfirm={handleGenerate}
          onCancel={() => setShowGenerateDialog(false)}
        />
      )}

      {showOnboarding && (
        <Onboarding
          onOpenSettings={() => { setShowOnboarding(false); store.setShowSettings(true) }}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {store.showSettings && <SettingsModal />}
    </div>
  )
}
