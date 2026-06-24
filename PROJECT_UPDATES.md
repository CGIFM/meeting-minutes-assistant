# 会议纪要助手 - 更新日志

## 2026-06-25 v1.2 LLM 配置 + 生成流程

### 新增
- 转录完成后弹出生成对话框：选 LLM + 选模型 + 填补充要求，确认后生成纪要
- 设置面板：测试 LLM 连接、获取可用模型列表、自定义 API base_url
- 自动检测并导入 CC switch 的 Claude API Key（含中转地址）
- 支持中转 API：Claude provider 可配置自定义 base_url
- 从 ~/.cc-switch/cc-switch.db 读取当前激活的 Claude 配置

### 验证
- CC switch Claude Key 检测+导入 ✓
- Claude 连接测试 ✓
- 获取模型列表 ✓（sonnet-4 / opus-4 / haiku-4.5 / 3.5-sonnet）

## 2026-06-25 v1.1 产品功能完善

### 新增
- 录音功能：侧边栏"开始录音"，停止后自动转录
- 说话人改名：点击说话人标签重命名，一改全改
- 导出功能：复制转录/纪要、导出 .md 文件
- 流式转录：转录时逐段实时显示识别结果
- 多轮对话：生成纪要后可继续追问修改
- FunASR 模型已下载：SenseVoice + VAD + CAM++

### 修复
- WKWebView 兼容：全部组件内联样式
- 后端路径：始终从项目目录加载 .venv
- 布局：webView autoresizingMask 填满窗口

## 2026-06-25 v1.0 项目初始化

### 完成内容
- 项目创建：`~/Projects/meeting-minutes-assistant/`
- 架构：Swift 原生壳 (WKWebView) + Python FastAPI 后端 + React 前端
- 桌面 app：`~/Applications/会议纪要助手.app`，双击即可打开
- 支持：拖拽音频 → 自动转录 → 确认生成会议纪要 → 多轮对话修改

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
