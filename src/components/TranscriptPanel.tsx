import { useAppStore } from '../stores/appStore'

export function TranscriptPanel() {
  const { currentMeeting } = useAppStore()

  if (!currentMeeting) return null

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const speakerColors: Record<string, string> = {}
  const colors = ['text-blue-400', 'text-emerald-400', 'text-purple-400', 'text-amber-400', 'text-rose-400']
  let colorIdx = 0

  const getSpeakerColor = (speaker: string) => {
    if (!speakerColors[speaker]) {
      speakerColors[speaker] = colors[colorIdx % colors.length]
      colorIdx++
    }
    return speakerColors[speaker]
  }

  return (
    <div className="w-1/2 border-r border-white/[0.06] flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/[0.06]">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">转录结果</h2>
        <p className="text-[11px] text-white/25 mt-1 truncate">{currentMeeting.filename}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {currentMeeting.segments.length > 0 ? (
          currentMeeting.segments.map((seg, i) => (
            <div key={i} className="flex gap-3 group">
              <span className="text-white/20 text-[10px] font-mono shrink-0 pt-1 w-10 text-right">
                {formatTime(seg.start)}
              </span>
              <div className="flex-1">
                <span className={`font-medium text-[10px] uppercase tracking-wider ${getSpeakerColor(seg.speaker)}`}>
                  {seg.speaker}
                </span>
                <p className="text-white/70 text-sm mt-0.5 leading-relaxed">{seg.text}</p>
              </div>
            </div>
          ))
        ) : currentMeeting.transcript ? (
          <pre className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{currentMeeting.transcript}</pre>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/30 text-sm">正在转录...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
