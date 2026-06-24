import { useAppStore } from '../stores/appStore'

export function ProgressBar() {
  const { isTranscribing, isGenerating, transcribeProgress } = useAppStore()

  const stage = isTranscribing ? '语音识别中' : isGenerating ? '生成纪要中' : ''
  const progress = isTranscribing ? transcribeProgress : undefined

  if (!stage) return null

  return (
    <div className="h-10 bg-white border-t border-gray-200 flex items-center px-4 gap-3">
      <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        {stage}...
      </div>

      {progress !== undefined && (
        <>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">{Math.round(progress * 100)}%</span>
        </>
      )}

      {!progress && (
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full animate-pulse w-1/3" />
        </div>
      )}
    </div>
  )
}
