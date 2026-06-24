import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 全局阻止 WKWebView 默认的文件拖拽打开行为
window.addEventListener('dragover', (e) => {
  e.preventDefault()
}, true)
window.addEventListener('drop', (e) => {
  e.preventDefault()
}, true)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
