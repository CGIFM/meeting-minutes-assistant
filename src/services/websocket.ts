import { BACKEND_PORT } from './api'

type MessageHandler = (data: any) => void

export class ChatWebSocket {
  private ws: WebSocket | null = null
  private onMessage: MessageHandler

  constructor(onMessage: MessageHandler) {
    this.onMessage = onMessage
  }

  connect() {
    const port = BACKEND_PORT()
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws/chat`)
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.onMessage(data)
    }
    this.ws.onerror = (e) => console.error('WebSocket error:', e)
    return new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve()
      this.ws!.onerror = () => reject(new Error('WebSocket connection failed'))
    })
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  close() {
    this.ws?.close()
  }
}

export function connectTranscribeWS(
  jobId: string,
  onProgress: (p: number) => void,
  onSegment: (segment: any) => void,
  onComplete: (result: any) => void,
  onError: (msg: string) => void,
) {
  const port = BACKEND_PORT()
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws/transcribe/${jobId}`)
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'progress') onProgress(data.progress)
    else if (data.type === 'segment') onSegment(data.segment)
    else if (data.type === 'complete') { onComplete(data.result); ws.close() }
    else if (data.type === 'error') { onError(data.message); ws.close() }
  }
  return ws
}
