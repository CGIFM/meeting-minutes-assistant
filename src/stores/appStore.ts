import { create } from 'zustand'

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
}

interface AppState {
  backendPort: number | null
  setBackendPort: (port: number) => void

  meetings: Meeting[]
  currentMeeting: Meeting | null
  setCurrentMeeting: (meeting: Meeting | null) => void
  addMeeting: (meeting: Meeting) => void
  updateMeeting: (id: string, updates: Partial<Meeting>) => void

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

export const useAppStore = create<AppState>((set) => ({
  backendPort: null,
  setBackendPort: (port) => set({ backendPort: port }),

  meetings: [],
  currentMeeting: null,
  setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),
  addMeeting: (meeting) => set((s) => ({ meetings: [meeting, ...s.meetings], currentMeeting: meeting })),
  updateMeeting: (id, updates) => set((s) => ({
    meetings: s.meetings.map((m) => m.id === id ? { ...m, ...updates } : m),
    currentMeeting: s.currentMeeting?.id === id ? { ...s.currentMeeting, ...updates } : s.currentMeeting,
  })),

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
  },
  setSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),

  showSettings: false,
  setShowSettings: (val) => set({ showSettings: val }),
}))
