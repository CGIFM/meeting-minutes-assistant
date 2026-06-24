import { useState, useCallback } from 'react'
import { useAppStore } from './stores/appStore'
import { Sidebar } from './components/Sidebar'
import { DropZone } from './components/DropZone'
import { TranscriptPanel } from './components/TranscriptPanel'
import { MinutesPanel } from './components/MinutesPanel'
import { ProgressBar } from './components/ProgressBar'
import { SettingsModal } from './components/SettingsModal'
import { uploadAudio } from './services/api'
import { connectTranscribeWS, ChatWebSocket } from './services/websocket'

export default function App() {
  const store = useAppStore()
  const [chatWs, setChatWs] = useState<ChatWebSocket | null>(null)

  const port = store.backendPort || 58886

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
        (result) => {
          store.setTranscribing(false)
          store.setTranscribeProgress(1)
          store.updateMeeting(job_id, {
            transcript: result.full_text,
            segments: result.segments,
          })
          handleAutoSummarize(job_id, result.full_text)
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

  const handleAutoSummarize = useCallback(async (meetingId: string, transcript: string) => {
    store.setGenerating(true)

    const ws = new ChatWebSocket(port, (data) => {
      if (data.type === 'chunk') {
        store.updateMeeting(meetingId, {
          minutes: (store.currentMeeting?.minutes || '') + data.content,
        })
      } else if (data.type === 'done') {
        store.setGenerating(false)
        store.updateMeeting(meetingId, { minutes: data.full_content })
      } else if (data.type === 'error') {
        store.setGenerating(false)
        console.error('LLM 错误:', data.message)
      }
    })

    await ws.connect()
    setChatWs(ws)

    ws.send({
      action: 'summarize',
      meeting_id: meetingId,
      transcript,
      provider: store.settings.default_provider,
      model: store.settings.default_model,
    })
  }, [port, store])

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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0f0f12]">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onFileDrop={handleFileDrop} />

        <main className="flex-1 flex overflow-hidden rounded-tl-2xl bg-[#1a1a22] m-0">
          {store.currentMeeting ? (
            <>
              <TranscriptPanel />
              <MinutesPanel onChat={handleChat} />
            </>
          ) : (
            <DropZone onFileDrop={handleFileDrop} />
          )}
        </main>
      </div>

      {(store.isTranscribing || store.isGenerating) && <ProgressBar />}
      {store.showSettings && <SettingsModal />}
    </div>
  )
}
