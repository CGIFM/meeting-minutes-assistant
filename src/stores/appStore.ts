import { create } from 'zustand'
import { saveMeetingState } from '../services/api'

export interface TranscriptSegment {
  start: number
  end: number
  speaker: string
  text: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Meeting {
  id: string
  filename: string
  duration: number
  transcript: string
  minutes: string
  segments: TranscriptSegment[]
  chatHistory: ChatMessage[]
  created_at: string
}

export interface Settings {
  hotwords: string
  default_provider: string
  default_model: string
  prompt_template: string
  apikeys: Record<string, string>
  obsidian_dir: string
  export_dir: string
}

interface AppState {
  backendPort: number | null
  setBackendPort: (port: number) => void

  meetings: Meeting[]
  currentMeeting: Meeting | null
  setCurrentMeeting: (meeting: Meeting | null) => void
  addMeeting: (meeting: Meeting) => void
  updateMeeting: (id: string, updates: Partial<Meeting>) => void

  // 转录修正的 undo 栈：按 meetingId 分组，每项是该会议修正前的 segments 快照
  transcriptUndoStack: Record<string, TranscriptSegment[][]>
  pushTranscriptUndo: (id: string, snapshot: TranscriptSegment[]) => void
  popTranscriptUndo: (id: string) => TranscriptSegment[] | null

  // 转录修正的 diff 记录：按 meetingId 分组，每项是 { 段索引: {old, new} }
  // 渲染时检查段是否被改过，被改的段显示删除线+新文本
  transcriptDiffs: Record<string, Record<number, { old: string; new: string }>>
  setTranscriptDiffs: (id: string, diffs: Record<number, { old: string; new: string }>) => void
  clearTranscriptDiffs: (id: string) => void

  // 录音模式：true 时主面板切换成 RecordingPanel
  recordingMode: boolean
  setRecordingMode: (val: boolean) => void

  // 实时录音会话状态：idle(未开始) | recording | paused | processing(停止后处理中)
  recordingState: 'idle' | 'recording' | 'paused' | 'processing'
  setRecordingState: (val: 'idle' | 'recording' | 'paused' | 'processing') => void

  // 实时录音的 job_id（后端创建）
  recordingJobId: string | null
  setRecordingJobId: (val: string | null) => void

  // 实时识别的 segments（不带说话人，stop 后会被完整版替换）
  liveSegments: TranscriptSegment[]
  setLiveSegments: (val: TranscriptSegment[]) => void
  appendLiveSegment: (seg: TranscriptSegment) => void

  // 录音设备：可用输入设备列表 + 当前选中
  audioInputs: MediaDeviceInfo[]
  setAudioInputs: (devs: MediaDeviceInfo[]) => void
  selectedMicId: string
  setSelectedMicId: (id: string) => void

  // 是否同时录制系统音频（在线会议场景）
  recordSystemAudio: boolean
  setRecordSystemAudio: (val: boolean) => void
  // BlackHole 虚拟声卡的 deviceId（用作系统音频输入）
  systemAudioDeviceId: string
  setSystemAudioDeviceId: (val: string) => void

  // 保存状态
  dirtyIds: Set<string>
  saveStatus: 'idle' | 'saving' | 'saved'
  flushSave: () => Promise<void>

  isTranscribing: boolean
  transcribeProgress: number
  setTranscribing: (val: boolean) => void
  setTranscribeProgress: (val: number) => void

  isGenerating: boolean
  setGenerating: (val: boolean) => void

  settings: Settings
  setSettings: (settings: Partial<Settings>) => void

  showSettings: boolean
  setShowSettings: (val: boolean) => void
}

// 保存调度：单例，全局共享
const saveQueue: Record<string, any> = {}   // id -> { segments, transcript, minutes }
const saveTimers: Record<string, number> = {}

function _scheduleSave(id: string, snapshot: any, setSaveStatus: (s: 'idle' | 'saving' | 'saved') => void) {
  // 合并到队列
  saveQueue[id] = { ...(saveQueue[id] || {}), ...snapshot }
  // debounce 800ms
  if (saveTimers[id]) clearTimeout(saveTimers[id])
  saveTimers[id] = window.setTimeout(() => {
    _flushOne(id, setSaveStatus)
  }, 800)
}

async function _flushOne(id: string, setSaveStatus: (s: 'idle' | 'saving' | 'saved') => void) {
  const payload = saveQueue[id]
  if (!payload) return
  delete saveTimers[id]
  setSaveStatus('saving')
  try {
    await saveMeetingState(id, payload)
    delete saveQueue[id]
    setSaveStatus('saved')
    window.setTimeout(() => {
      // 如果期间没有新改动，回到 idle
      if (!saveQueue[id]) setSaveStatus('idle')
    }, 1500)
  } catch (e) {
    setSaveStatus('idle')
    console.error('save failed', e)
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  backendPort: null,
  setBackendPort: (port) => set({ backendPort: port }),

  meetings: [],
  currentMeeting: null,
  setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),
  addMeeting: (meeting) => set((s) => ({ meetings: [meeting, ...s.meetings], currentMeeting: meeting })),
  updateMeeting: (id, updates) => {
    set((s) => ({
      meetings: s.meetings.map((m) => m.id === id ? { ...m, ...updates } : m),
      currentMeeting: s.currentMeeting?.id === id ? { ...s.currentMeeting, ...updates } : s.currentMeeting,
    }))
    // 触发 debounce 保存：只保存可持久化字段
    const persist: any = {}
    if ('segments' in updates) persist.segments = updates.segments
    if ('transcript' in updates) persist.transcript = updates.transcript
    if ('minutes' in updates) persist.minutes = updates.minutes
    if (Object.keys(persist).length > 0) {
      _scheduleSave(id, persist, (status) => set({ saveStatus: status }))
      set((s) => ({ dirtyIds: new Set(s.dirtyIds).add(id) }))
    }
  },

  dirtyIds: new Set(),
  saveStatus: 'idle',
  transcriptUndoStack: {},
  pushTranscriptUndo: (id, snapshot) => set((s) => ({
    transcriptUndoStack: {
      ...s.transcriptUndoStack,
      [id]: [...(s.transcriptUndoStack[id] || []), snapshot],
    },
  })),
  popTranscriptUndo: (id) => {
    const stack = get().transcriptUndoStack[id] || []
    if (stack.length === 0) return null
    const last = stack[stack.length - 1]
    set((s) => ({
      transcriptUndoStack: {
        ...s.transcriptUndoStack,
        [id]: s.transcriptUndoStack[id].slice(0, -1),
      },
    }))
    return last
  },
  transcriptDiffs: {},
  setTranscriptDiffs: (id, diffs) => set((s) => ({
    transcriptDiffs: { ...s.transcriptDiffs, [id]: diffs },
  })),
  clearTranscriptDiffs: (id) => set((s) => {
    const next = { ...s.transcriptDiffs }
    delete next[id]
    return { transcriptDiffs: next }
  }),
  recordingMode: false,
  setRecordingMode: (val) => set({ recordingMode: val }),
  recordingState: 'idle',
  setRecordingState: (val) => set({ recordingState: val }),
  recordingJobId: null,
  setRecordingJobId: (val) => set({ recordingJobId: val }),
  liveSegments: [],
  setLiveSegments: (val) => set({ liveSegments: val }),
  appendLiveSegment: (seg) => set((s) => ({ liveSegments: [...s.liveSegments, seg] })),
  audioInputs: [],
  setAudioInputs: (devs) => set({ audioInputs: devs }),
  selectedMicId: '',
  setSelectedMicId: (id) => set({ selectedMicId: id }),
  recordSystemAudio: false,
  setRecordSystemAudio: (val) => set({ recordSystemAudio: val }),
  systemAudioDeviceId: '',
  setSystemAudioDeviceId: (val) => set({ systemAudioDeviceId: val }),
  flushSave: async () => {
    const ids = Object.keys(saveQueue)
    if (ids.length === 0) {
      set({ saveStatus: 'saved' })
      window.setTimeout(() => set({ saveStatus: 'idle' }), 800)
      return
    }
    set({ saveStatus: 'saving' })
    await Promise.all(ids.map((id) => _flushOne(id, (status) => set({ saveStatus: status }))))
    set({ dirtyIds: new Set() })
  },

  isTranscribing: false,
  transcribeProgress: 0,
  setTranscribing: (val) => set({ isTranscribing: val }),
  setTranscribeProgress: (val) => set({ transcribeProgress: val }),

  isGenerating: false,
  setGenerating: (val) => set({ isGenerating: val }),

  settings: {
    hotwords: '',
    default_provider: 'claude',
    default_model: '',
    prompt_template: '',
    apikeys: {},
    obsidian_dir: '',
    export_dir: '',
  },
  setSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),

  showSettings: false,
  setShowSettings: (val) => set({ showSettings: val }),
}))
