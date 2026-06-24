# 会议纪要助手 - 更新日志

## 2026-06-25 v1.1 产品功能完善

### 新增
- 录音功能：侧边栏点击"开始录音"，停止后自动转录
- 说话人改名：点击说话人标签重命名，一改全改
- 导出功能：复制转录/纪要、导出 .md 文件
- 流式转录：转录时逐段实时显示识别结果
- 多轮对话：生成纪要后可继续追问修改
- FunASR 模型已下载：SenseVoice + VAD + CAM++

### 修复
- WKWebView 兼容：全部组件内联样式
- 后端路径：始终从项目目录加载 .venv
- 布局：webView autoresizingMask 填满窗口
- Tailwind Vite 插件正确加载

## 2026-06-25 v1.0 项目初始化

### 完成内容
- 项目创建：`~/Projects/meeting-minutes-assistant/`
- 架构：Swift 原生壳 (WKWebView) + Python FastAPI 后端 + React 前端
- 桌面 app：`~/Applications/会议纪要助手.app`，双击即可打开
- 支持：拖拽音频 → 自动转录 → 自动生成会议纪要 → 多轮对话修改

### 技术栈
- 原生壳：Swift + Cocoa + WebKit
- 前端：React 19 + Zustand + Vite
- 后端：Python 3.12 + FastAPI + FunASR + WebSocket
- ASR：SenseVoice (中文优化) + 热词 + 说话人分离
- LLM：Claude / OpenAI / Gemini / Ollama (流式输出)

### 待办
- [ ] app 图标设计
- [ ] 音频播放同步定位
- [ ] 首次启动引导页
- [ ] 会议标签/分类
