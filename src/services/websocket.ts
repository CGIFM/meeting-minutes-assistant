type MessageHandler = (data: any) => void

export class ChatWebSocket {
  private ws: WebSocket | null = null
  private onMessage: MessageHandler
  private port: number

  constructor(port: number, onMessage: MessageHandler) {
    this.port = port
    this.onMessage = onMessage
  }

  connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/api/ws/chat`)
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.onMessage(data)
    }
    this.ws.onerror = (e) => console.error('WebSocket error:', e)
    return new Promise<void>((resolve) => {
      this.ws!.onopen = () => resolve()
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
  port: number,
  jobId: string,
  onProgress: (p: number) => void,
  onComplete: (result: any) => void,
  onError: (msg: string) => void,
) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws/transcribe/${jobId}`)
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'progress') onProgress(data.progress)
    else if (data.type === 'complete') { onComplete(data.result); ws.close() }
    else if (data.type === 'error') { onError(data.message); ws.close() }
  }
  return ws
}
