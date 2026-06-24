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
import { AsrModelDialog } from './components/AsrModelDialog'
import { uploadAudio, getApiKeys, getMeetings, getMeeting, BACKEND_PORT } from './services/api'
import { connectTranscribeWS, ChatWebSocket } from './services/websocket'

export default function App() {
  const store = useAppStore()
  const [chatWs, setChatWs] = useState<ChatWebSocket | null>(null)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [pendingMeetingId, setPendingMeetingId] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const startTranscription = useCallback(async (file: File, asrModel: string) => {
    store.setTranscribing(true)
    store.setTranscribeProgress(0.05)

    try {
      const { job_id, filename } = await uploadAudio(file, asrModel)
      const newMeeting = {
        id: job_id, filename, duration: 0, transcript: '', minutes: '', segments: [], chatHistory: [],
        created_at: new Date().toISOString(),
      }
      store.addMeeting(newMeeting)

      connectTranscribeWS(
        job_id,
        (progress) => store.setTranscribeProgress(progress),
        (segment) => {
          const meeting = store.currentMeeting
          if (meeting) store.updateMeeting(job_id, { segments: [...(meeting.segments || []), segment] })
        },
        (result) => {
          store.setTranscribing(false)
          store.setTranscribeProgress(1)
          store.updateMeeting(job_id, { transcript: result.full_text, segments: result.segments })
          setPendingMeetingId(job_id)
          setShowGenerateDialog(true)
        },
        (error) => { store.setTranscribing(false); alert(`转录失败: ${error}`) },
      )
    } catch (e: any) {
      store.setTranscribing(false)
      alert(`上传失败: ${e.message}`)
    }
  }, [store])

  const handleFileDrop = useCallback((file: File) => {
    setPendingFile(file)
  }, [])

  const handleGenerate = useCallback(async (options: { provider: string; model: string; customPrompt: string }) => {
    setShowGenerateDialog(false)
    const meeting = store.meetings.find(m => m.id === pendingMeetingId) || store.currentMeeting
    if (!meeting?.transcript) return

    store.updateMeeting(pendingMeetingId, { minutes: '' })
    store.setGenerating(true)

    const ws = new ChatWebSocket((data) => {
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
  }, [pendingMeetingId, store])

  const handleChat = useCallback((message: string) => {
    if (!store.currentMeeting) return

    const meeting = store.currentMeeting
    store.updateMeeting(meeting.id, {
      chatHistory: [...meeting.chatHistory, { role: 'user', content: message }],
    })
    store.setGenerating(true)

    let responseText = ''
    const ws = new ChatWebSocket((data) => {
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
  }, [chatWs, store])

  const currentMeeting = store.currentMeeting

  useState(() => {
    setTimeout(async () => {
      try {
        const meetings = await getMeetings()
        const loaded: any[] = []
        for (const m of meetings.slice(0, 20)) {
          try {
            const detail = await getMeeting(m.id)
            loaded.push({
              id: detail.id,
              filename: detail.filename,
              duration: detail.duration || 0,
              transcript: detail.transcript || '',
              minutes: detail.minutes || '',
              segments: [],
              chatHistory: (detail.chat_history || []).map((c: any) => ({ role: c.role, content: c.content })),
              created_at: detail.created_at,
            })
          } catch {}
        }
        useAppStore.setState({ meetings: loaded, currentMeeting: null })
        const keys = await getApiKeys()
        const configured = keys.claude?.configured || keys.openai?.configured || keys.gemini?.configured
        if (!configured) setShowOnboarding(true)
      } catch {}
    }, 300)
  })

  const audioUrl = currentMeeting
    ? `http://127.0.0.1:${BACKEND_PORT()}/api/audio?job_id=${currentMeeting.id}&filename=${encodeURIComponent(currentMeeting.filename)}`
    : ''

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation()
        const file = e.dataTransfer.files[0]
        if (file) handleFileDrop(file)
      }}
      style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',background:'#0f0f12'}}
    >
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Sidebar onFileDrop={handleFileDrop} />

        <main style={{flex:1,display:'flex',overflow:'hidden',borderTopLeftRadius:'16px',background:'#1a1a22'}}>
          {currentMeeting ? (
            <>
              <TranscriptPanel audioUrl={audioUrl} />
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

      {pendingFile && (
        <AsrModelDialog
          filename={pendingFile.name}
          onConfirm={(modelId) => {
            const f = pendingFile
            setPendingFile(null)
            startTranscription(f, modelId)
          }}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {store.showSettings && <SettingsModal />}
    </div>
  )
}
