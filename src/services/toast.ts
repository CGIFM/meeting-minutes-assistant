let toastContainer: HTMLDivElement | null = null

function getContainer(): HTMLDivElement {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;'
  document.body.appendChild(toastContainer)
  return toastContainer
}

export function toast(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const container = getContainer()
  const el = document.createElement('div')
  const colors = {
    info: { bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.4)', text: '#bfdbfe' },
    error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#fca5a5' },
    success: { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)', text: '#86efac' },
  }
  const c = colors[type]
  el.style.cssText = `background:${c.bg};border:1px solid ${c.border};color:${c.text};padding:10px 18px;border-radius:10px;font-size:12px;font-family:-apple-system,sans-serif;max-width:80vw;box-shadow:0 4px 12px rgba(0,0,0,0.3);backdrop-filter:blur(8px);opacity:0;transition:opacity 0.2s;pointer-events:auto;`
  el.textContent = message
  container.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 200)
  }, 3000)
}
