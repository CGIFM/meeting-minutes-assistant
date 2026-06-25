// 转录文档构建：导出 MD、生成纪要、聊天附带都用同一份格式
// 改说话人名字后，segments 里就是新名字，所以这里直接用 segments

import type { Meeting } from '../stores/appStore'

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 只有正文（每段一行，加粗时间戳和说话人）—— 用于发给 AI
export function buildTranscriptBody(segments: any[], fallback = ''): string {
  if (segments && segments.length > 0) {
    return segments
      .map(s => `**[${formatTime(s.start)}] ${s.speaker}:** ${s.text}`)
      .join('\n\n')
  }
  return fallback
}

// 完整 MD 文档（含标题、导出时间）—— 与"导出 MD"完全一致
export function buildTranscriptMd(meeting: Meeting | undefined | null): string {
  if (!meeting) return ''
  const header = `# ${meeting.filename} - 转录记录\n\n> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`
  return header + buildTranscriptBody(meeting.segments || [], meeting.transcript) + '\n'
}

// 把 AI 返回的修正后 MD 文档解析回 segments。
// 支持 **[mm:ss] 说话人:** 文本  和  [mm:ss] 说话人: 文本  两种格式
// 时间戳支持 [m:ss] / [mm:ss] / [h:mm:ss]
export function parseTranscriptMd(md: string): { start: number; end: number; speaker: string; text: string }[] {
  if (!md) return []
  const out: { start: number; end: number; speaker: string; text: string }[] = []
  // 去掉 markdown 代码块包装（AI 偶尔会加）
  const cleaned = md.replace(/^[\s\S]*?```(?:markdown)?\s*/m, '').replace(/\s*```\s*$/m, '')
  const pat = /^\s*\*{0,2}\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:*\n]+?):\s*\*{0,2}\s*(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = pat.exec(cleaned)) !== null) {
    const t = m[1].split(':').map(Number)
    let sec = 0
    if (t.length === 3) sec = t[0] * 3600 + t[1] * 60 + t[2]
    else sec = t[0] * 60 + t[1]
    out.push({
      start: sec,
      end: sec,
      speaker: m[2].trim(),
      text: m[3].trim(),
    })
  }
  return out
}
