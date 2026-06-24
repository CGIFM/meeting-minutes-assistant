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
  const colors = ['text-blue-600', 'text-green-600', 'text-purple-600', 'text-orange-600', 'text-pink-600']
  let colorIdx = 0

  const getSpeakerColor = (speaker: string) => {
    if (!speakerColors[speaker]) {
      speakerColors[speaker] = colors[colorIdx % colors.length]
      colorIdx++
    }
    return speakerColors[speaker]
  }

  return (
    <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">转录结果</h2>
        <p className="text-xs text-gray-500">{currentMeeting.filename}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {currentMeeting.segments.length > 0 ? (
          currentMeeting.segments.map((seg, i) => (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="text-gray-400 text-xs font-mono shrink-0 pt-0.5 w-12 text-right">
                {formatTime(seg.start)}
              </span>
              <div>
                <span className={`font-medium text-xs ${getSpeakerColor(seg.speaker)}`}>
                  {seg.speaker}
                </span>
                <p className="text-gray-800 mt-0.5">{seg.text}</p>
              </div>
            </div>
          ))
        ) : currentMeeting.transcript ? (
          <pre className="text-sm text-gray-800 whitespace-pre-wrap">{currentMeeting.transcript}</pre>
        ) : (
          <div className="text-center text-gray-400 py-8">转录中...</div>
        )}
      </div>
    </div>
  )
}
