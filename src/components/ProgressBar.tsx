import { useAppStore } from '../stores/appStore'

export function ProgressBar() {
  const { isTranscribing, isGenerating, transcribeProgress } = useAppStore()

  const stage = isTranscribing ? '语音识别中' : isGenerating ? '生成纪要中' : ''
  const progress = isTranscribing ? transcribeProgress : undefined

  if (!stage) return null

  return (
    <div className="h-11 bg-[#0f0f12] border-t border-white/5 flex items-center px-5 gap-3">
      <div className="flex items-center gap-2 text-xs text-white/50 shrink-0">
        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
        {stage}
      </div>

      {progress !== undefined ? (
        <>
          <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-white/30 font-mono shrink-0">{Math.round(progress * 100)}%</span>
        </>
      ) : (
        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" />
        </div>
      )}
    </div>
  )
}
