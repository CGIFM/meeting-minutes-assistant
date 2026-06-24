// 后端和前端同源（FastAPI 既提供 API 又提供页面），用当前页面端口
const BACKEND_PORT = () => {
  if (typeof window !== 'undefined' && window.location.port) {
    return window.location.port
  }
  return (window as any).__BACKEND_PORT__ || 0
}

const BASE_URL = () => {
  const port = BACKEND_PORT()
  return port ? `http://127.0.0.1:${port}` : ''
}

export async function uploadAudio(file: File): Promise<{ job_id: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL()}/api/transcribe`, { method: 'POST', body: form })
  return res.json()
}

export async function getTranscription(jobId: string) {
  const res = await fetch(`${BASE_URL()}/api/transcribe/${jobId}`)
  return res.json()
}

export async function getSettings() {
  const res = await fetch(`${BASE_URL()}/api/settings`)
  return res.json()
}

export async function updateSettings(data: any) {
  await fetch(`${BASE_URL()}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateApiKey(provider: string, api_key: string, base_url: string = '') {
  await fetch(`${BASE_URL()}/api/settings/apikey`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key, base_url }),
  })
}

export async function getApiKeys() {
  const res = await fetch(`${BASE_URL()}/api/settings/apikeys`)
  return res.json()
}

export async function getMeetings() {
  const res = await fetch(`${BASE_URL()}/api/meetings`)
  return res.json()
}

export async function getMeeting(id: string) {
  const res = await fetch(`${BASE_URL()}/api/meetings/${id}`)
  return res.json()
}

export { BACKEND_PORT }
