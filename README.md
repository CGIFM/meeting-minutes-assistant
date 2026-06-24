# 会议纪要助手

AI 驱动的会议转录与纪要生成桌面应用。

## 功能

- 拖拽音频文件自动转录 + 自动生成会议纪要
- 支持 60 分钟以上长录音
- FunASR SenseVoice 语音识别（中文优化）+ 说话人分离
- 热词自定义（解决专有名词识别问题）
- 多 LLM 支持：Claude / OpenAI / Gemini / Ollama
- 流式生成纪要 + 多轮对话修改
- 自定义提示词模板

## 开发启动

```bash
# 1. 启动后端
cd backend && source .venv/bin/activate && python main.py

# 2. 另一个终端启动前端
npm run dev

# 浏览器打开 http://localhost:5173
```

## 首次使用

1. 启动后进入设置页面，配置 API Key（如 Claude）
2. 可选：添加热词（每行一个，解决专有名词识别）
3. 拖入音频文件，自动完成转录和纪要生成

## 技术栈

- 前端：React + TailwindCSS + Zustand
- 后端：Python FastAPI + FunASR + WebSocket
- 桌面：Electron
- ASR：SenseVoice (FunASR) + CAM++ 说话人分离
- LLM：Claude / OpenAI / Gemini / Ollama
