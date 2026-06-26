import { toast } from './services/toast'
import { useState, useCallback, useEffect } from 'react'
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
import { FixTranscriptDialog } from './components/FixTranscriptDialog'
import { RecordingPanel } from './components/RecordingPanel'
import { uploadAudio, getApiKeys, getMeetings, getMeeting, clearChatHistory, generateMeetingTitle, BACKEND_PORT } from './services/api'
import { connectTranscribeWS, ChatWebSocket } from './services/websocket'
import { buildTranscriptBody, buildTranscriptMd, parseTranscriptMd, formatTime as formatTimeMd } from './services/transcriptDoc'

export default function App() {
  const store = useAppStore()
  const [chatWs, setChatWs] = useState<ChatWebSocket | null>(null)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [pendingMeetingId, setPendingMeetingId] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showFixDialog, setShowFixDialog] = useState(false)

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
          // 自动起标题：后端只在文件名是默认值（录音_/UUID 等）时才改，不会覆盖用户起的名
          const s = useAppStore.getState().settings
          generateMeetingTitle(job_id, s.default_provider, s.default_model).then((r) => {
            if (r.applied && r.title) {
              useAppStore.getState().updateMeeting(job_id, { filename: r.title })
            }
          }).catch(() => {})
        },
        (error) => { store.setTranscribing(false); toast(`转录失败: ${error}`, 'error') },
      )
    } catch (e: any) {
      store.setTranscribing(false)
      toast(`上传失败: ${e.message}`, 'error')
    }
  }, [store])

  const handleFileDrop = useCallback((file: File) => {
    setPendingFile(file)
  }, [])

  const handleGenerate = useCallback(async (options: { provider: string; model: string; customPrompt: string }) => {
    setShowGenerateDialog(false)
    const meeting = store.meetings.find(m => m.id === pendingMeetingId) || store.currentMeeting
    if (!meeting?.transcript) return

    // 完整 transcript：与「导出 MD」一致的格式（标题 + 加粗时间戳和说话人 + 文本）
    const liveTranscript = buildTranscriptBody(meeting.segments || [], meeting.transcript)

    // 重生成 = 重新开始：清空旧对话历史（前端 + 数据库），避免 AI 看到旧纪要/旧提示词导致输出错乱
    const promptPreview = (options.customPrompt || '').trim() || '（使用默认提示词生成）'
    const newChatHistory = [
      { role: 'user' as const, content: `【生成提示词】\n${promptPreview}` },
    ]
    store.updateMeeting(pendingMeetingId, {
      minutes: '',
      chatHistory: newChatHistory,
    })
    // 后端 chat_history 表也要清，否则重启加载会议时又会冒出来
    clearChatHistory(pendingMeetingId).catch(() => {})
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
      } else if (data.type === 'title') {
        store.updateMeeting(pendingMeetingId, { filename: data.title })
        toast(`已自动生成标题: ${data.title}`, 'success')
      } else if (data.type === 'error') {
        store.setGenerating(false)
        toast(`生成失败: ${data.message}`, 'error')
      }
    })

    await ws.connect()
    setChatWs(ws)

    ws.send({
      action: 'summarize',
      meeting_id: pendingMeetingId,
      transcript: liveTranscript,
      provider: options.provider,
      model: options.model,
      custom_prompt: options.customPrompt,
    })
  }, [pendingMeetingId, store])

  const handleChat = useCallback((message: string, options?: { attachTranscript?: boolean }) => {
    // 用 getState 读最新，避免闭包陷阱
    const state = useAppStore.getState()
    const meeting = state.meetings.find(m => m.id === (state.currentMeeting?.id || ''))
    if (!meeting) return

    // 如果开启"附带转录文档"，把完整转录 MD（与导出 MD 一致，含最新说话人名）拼到 user 消息前面，
    // 并且【这条完整版要存进 chatHistory】，这样：
    //  1. AI 这次能基于完整原文回答
    //  2. 后续对话即使关掉 toggle，前端把 chatHistory 作为 history 传给 AI 时仍然带着 transcript，AI 一直能看得到
    let finalMessage = message
    if (options?.attachTranscript) {
      const transcriptMd = buildTranscriptMd(meeting)
      finalMessage = `${transcriptMd}\n\n---\n\n【以上为完整会议转录文档，请基于此优化】\n\n【我的修改要求】\n${message}`
    }

    // 立刻在 UI 里把 user 消息加上（存 finalMessage：开启 toggle 时是带 transcript 的完整版，
    // 下次发消息这条会进 history，AI 就能一直看到 transcript）
    state.updateMeeting(meeting.id, {
      chatHistory: [...meeting.chatHistory, { role: 'user', content: finalMessage }],
    })
    state.setGenerating(true)

    let responseText = ''
    const ws = new ChatWebSocket((data) => {
      const cur = useAppStore.getState()
      const m = cur.meetings.find(x => x.id === meeting.id)
      if (!m) return

      if (data.type === 'chunk') {
        responseText += data.content
        // 把最后一条 assistant 消息替换为累积中的 responseText
        const newHistory = [...m.chatHistory]
        const lastIdx = newHistory.length - 1
        if (lastIdx >= 0 && newHistory[lastIdx].role === 'assistant') {
          newHistory[lastIdx] = { role: 'assistant', content: responseText }
        } else {
          newHistory.push({ role: 'assistant', content: responseText })
        }
        cur.updateMeeting(meeting.id, { chatHistory: newHistory })
      } else if (data.type === 'done') {
        cur.setGenerating(false)
        // 如果响应像完整纪要（>200 字），同步到 minutes 字段
        if (responseText.length > 200) {
          cur.updateMeeting(meeting.id, { minutes: responseText })
        }
      } else if (data.type === 'error') {
        cur.setGenerating(false)
        toast(`生成失败: ${data.message}`, 'error')
      }
    })

    ws.connect().then(() => {
      ws.send({
        action: 'chat',
        meeting_id: meeting.id,
        message: finalMessage,
        provider: state.settings.default_provider,
        model: state.settings.default_model,
        // 历史对话完整传给后端，保留上下文
        history: [
          { role: 'assistant', content: meeting.minutes },
          ...meeting.chatHistory.filter((_, i) =>
            // 已经在 chatHistory 末尾的 user 消息不需要再发，因为 message 字段已带
            i < meeting.chatHistory.length - 1 || meeting.chatHistory[i].role !== 'user'
          ),
        ],
      })
      setChatWs(ws)
    }).catch((e) => {
      state.setGenerating(false)
      toast(`连接失败: ${e.message}`, 'error')
    })
  }, [])

  const handleFixTranscript = useCallback(async (options: { provider: string; model: string; userRequest: string }) => {
    setShowFixDialog(false)
    const state = useAppStore.getState()
    const meeting = state.meetings.find(m => m.id === (state.currentMeeting?.id || ''))
    if (!meeting?.segments || meeting.segments.length === 0) return

    // 1. 先把当前 segments 推入 undo 栈（深拷贝，避免后续 mutation 影响）
    const snapshot = meeting.segments.map(s => ({ ...s }))
    state.pushTranscriptUndo(meeting.id, snapshot)

    // 2. 构建要发给 AI 的完整 MD 文档
    const transcriptMd = buildTranscriptMd(meeting)

    state.setGenerating(true)
    let accumulated = ''

    const ws = new ChatWebSocket((data) => {
      if (data.type === 'chunk') {
        accumulated += data.content
      } else if (data.type === 'done') {
        const cur = useAppStore.getState()
        const m = cur.meetings.find(x => x.id === meeting.id)
        if (!m) { cur.setGenerating(false); return }

        const full = data.full_content || accumulated
        const newSegments = parseTranscriptMd(full)

        if (newSegments.length === 0) {
          // AI 输出格式异常，解析失败：回滚 undo 栈，提示用户
          state.popTranscriptUndo(meeting.id)
          cur.setGenerating(false)
          toast('AI 输出格式异常，未能解析为转录段落，已撤销操作', 'error')
          return
        }

        // 智能合并：按"时间戳最近"匹配原段，AI 合并/拆分段也不会错位
        // diff 严格按原 segments 索引记录，前端渲染 segments[i] 查 diff[i] 一定对得上
        const origSegs = m.segments
        const newUsed = new Array(newSegments.length).fill(false)
        const diffs: Record<number, { old: string; new: string }> = {}
        const merged: typeof origSegs = []

        for (let i = 0; i < origSegs.length; i++) {
          const orig = origSegs[i]
          // 在 newSegments 里找时间戳最近的、未被匹配过的
          let bestIdx = -1
          let bestDelta = Infinity
          for (let j = 0; j < newSegments.length; j++) {
            if (newUsed[j]) continue
            const delta = Math.abs(newSegments[j].start - orig.start)
            if (delta < bestDelta) {
              bestDelta = delta
              bestIdx = j
            }
          }
          // 5 秒阈值内认为是同一段
          if (bestIdx >= 0 && bestDelta <= 5) {
            newUsed[bestIdx] = true
            const newSeg = newSegments[bestIdx]
            // 保留原段的时间戳和说话人，只换文本（避免 AI 误改说话人）
            merged.push({ ...orig, text: newSeg.text })
            if ((orig.text || '') !== newSeg.text) {
              diffs[i] = { old: orig.text || '', new: newSeg.text }
            }
          } else {
            // AI 漏了这段，保留原样（不记 diff）
            merged.push(orig)
          }
        }

        // AI 多输出的段（罕见，比如把一段拆两段）：append 到末尾
        for (let j = 0; j < newSegments.length; j++) {
          if (!newUsed[j]) {
            merged.push(newSegments[j])
          }
        }

        // 更新 segments + transcript（同时更新，保持一致）
        const newTranscript = merged
          .map(s => `[${formatTimeMd(s.start)}] ${s.speaker}: ${s.text}`)
          .join('\n')
        cur.updateMeeting(meeting.id, { segments: merged, transcript: newTranscript })
        cur.setTranscriptDiffs(meeting.id, diffs)
        cur.setGenerating(false)
        const changedCount = Object.keys(diffs).length
        toast(`已修正 ${changedCount} 段（红色标注）。审完后点 "✓ 确认修正" 清掉高亮，或 "↶ 撤回" ���复`, 'success')
      } else if (data.type === 'error') {
        // 出错时也回滚 undo 栈
        state.popTranscriptUndo(meeting.id)
        state.setGenerating(false)
        toast(`修正失败: ${data.message}`, 'error')
      }
    })

    await ws.connect()
    setChatWs(ws)
    ws.send({
      action: 'fix_transcript',
      meeting_id: meeting.id,
      transcript: transcriptMd,
      user_request: options.userRequest,
      provider: options.provider,
      model: options.model,
    })
  }, [])

  const handleUndoTranscript = useCallback(() => {
    const state = useAppStore.getState()
    const meeting = state.meetings.find(m => m.id === (state.currentMeeting?.id || ''))
    if (!meeting) return

    const prev = state.popTranscriptUndo(meeting.id)
    if (!prev) {
      toast('没有可撤回的修正', 'info')
      return
    }
    const newTranscript = prev
      .map(s => `[${formatTimeMd(s.start)}] ${s.speaker}: ${s.text}`)
      .join('\n')
    state.updateMeeting(meeting.id, { segments: prev, transcript: newTranscript })
    // 撤回到上一版后，重置 diff 显示：如果有更早的版本，重新对比；否则清空
    const remaining = state.transcriptUndoStack[meeting.id] || []
    if (remaining.length > 0) {
      const earlier = remaining[remaining.length - 1]
      const diffs: Record<number, { old: string; new: string }> = {}
      const earlierTexts = earlier.map(s => s.text || '')
      prev.forEach((seg, i) => {
        const oldText = earlierTexts[i] || ''
        if (oldText && oldText !== seg.text) {
          diffs[i] = { old: oldText, new: seg.text }
        }
      })
      state.setTranscriptDiffs(meeting.id, diffs)
    } else {
      state.clearTranscriptDiffs(meeting.id)
    }
    toast('已撤回上一次修正', 'success')
  }, [])

  const currentMeeting = store.currentMeeting

  // 全局 Ctrl/Cmd+S 保存 + 页面退出/隐藏时尽量保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        store.flushSave().then(() => {
          toast('已保存', 'success')
        })
      }
    }
    const flush = () => { store.flushSave().catch(() => {}) }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [store])

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
              segments: Array.isArray(detail.segments) ? detail.segments : [],
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
      style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',background:'#0f0f12',userSelect:'text'}}
    >
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Sidebar onFileDrop={handleFileDrop} />

        <main style={{flex:1,display:'flex',overflow:'hidden',borderTopLeftRadius:'16px',background:'#1a1a22'}}>
          {store.recordingMode ? (
            <RecordingPanel onComplete={() => {}} />
          ) : currentMeeting ? (
            <>
              <TranscriptPanel
                audioUrl={audioUrl}
                onFixTranscript={() => setShowFixDialog(true)}
                onUndoFix={handleUndoTranscript}
                canUndoFix={(store.transcriptUndoStack[currentMeeting.id]?.length || 0) > 0}
              />
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

      {showFixDialog && currentMeeting && (
        <FixTranscriptDialog
          segmentCount={currentMeeting.segments?.length || 0}
          onConfirm={handleFixTranscript}
          onCancel={() => setShowFixDialog(false)}
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
