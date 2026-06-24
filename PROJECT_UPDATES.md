# 会议纪要助手 - 更新日志

## 2026-06-25 项目初始化

### 完成内容
- 项目创建：`~/Projects/meeting-minutes-assistant/`
- 架构：Swift 原生壳 (WKWebView) + Python FastAPI 后端 + React 前端
- 前端：React + TailwindCSS + Zustand，深色主题专业 UI
- 后端：FunASR SenseVoice 语音识别 + CAM++ 说话人分离 + 多 LLM 支持
- 桌面 app：已安装到 `~/Applications/会议纪要助手.app`，双击即可打开
- 支持：拖拽音频 → 自动转录 → 自动生成会议纪要 → 多轮对话修改

### 技术栈
- 原生壳：Swift + Cocoa + WebKit (参照 Novel Shotter 架构)
- 前端：React 19 + TailwindCSS 4 + Zustand + Vite
- 后端：Python 3.12 + FastAPI + FunASR + WebSocket
- ASR：SenseVoice (中文优化) + 热词 + 说话人分离
- LLM：Claude / OpenAI / Gemini / Ollama (流式输出)

### 待办
- [ ] 首次使用引导（FunASR 模型自动下载）
- [ ] 录音功能（Web Audio API）
- [ ] app 图标设计
- [ ] 音频播放同步定位
