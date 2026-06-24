# 会议纪要助手 - 更新日志

## 2026-06-25 v1.3 多格式导出 + 多轮迭代

### 导出
- **Obsidian**：保存到 vault 的"会议纪要"文件夹，含 frontmatter 标签和完整转录
- **PDF**：reportlab + STHeiti 中文字体，支持标题/列表/表格
- **Word (.docx)**：python-docx，支持加粗和分级标题
- **图片 (PNG)**：html2canvas 截图，2x 高清
- **Markdown (.md)**：直接下载
- **复制**：复制到剪贴板

### 修改
- 多轮迭代修改：生成纪要后可在对话框不断追问调整（"按优先级排序"、"改成要点列表"等）
- 强化提示文案

## 2026-06-25 v1.2 LLM 配置 + 生成流程

- 转录完成后弹出生成对话框：选 LLM + 选模型 + 填补充要求
- 设置面板：测试 LLM 连接、获取可用模型列表、自定义 API base_url
- 自动检测并导入 CC switch 的 Claude API Key（含中转地址）
- 支持中转 API：Claude provider 可配置自定义 base_url
- 从 ~/.cc-switch/cc-switch.db 读取当前激活的 Claude 配置

## 2026-06-25 v1.1 产品功能完善

- 录音功能：侧边栏"开始录音"，停止后自动转录
- 说话人改名：点击说话人标签重命名，一改全改
- 流式转录：转录时逐段实时显示识别结果
- 音频播放器：点击转录片段跳转，当前播放高亮
- 重新生成：纪要面板"重生成"按钮
- 首次启动引导：检测 API Key 未配置时弹窗
- 会议搜索：侧边栏搜索框
- FunASR 模型已下载：SenseVoice + VAD + CAM++

## 2026-06-25 v1.0 项目初始化

- 项目创建：`~/Projects/meeting-minutes-assistant/`
- 架构：Swift 原生壳 (WKWebView) + Python FastAPI 后端 + React 前端
- 桌面 app：`~/Applications/会议纪要助手.app`，双击即可打开
- 支持：拖拽音频 → 自动转录 → 确认生成会议纪要 → 多轮对话修改 → 多格式导出

### 技术栈
- 原生壳：Swift + Cocoa + WebKit
- 前端：React 19 + Zustand + Vite（全部内联样式兼容 WKWebView）
- 后端：Python 3.12 + FastAPI + FunASR + WebSocket
- ASR：SenseVoice (中文优化) + 热词 + 说话人分离
- LLM：Claude / OpenAI / Gemini / Ollama (流式输出)
- 导出：reportlab (PDF) + python-docx (Word) + html2canvas (图片)

### 当前功能清单
- [x] 拖入音频文件 / 现场录音
- [x] 流式语音识别（SenseVoice + 说话人分离）
- [x] 热词自定义（解决专有名词识别）
- [x] 说话人改名（一改全改）
- [x] 音频回放 + 转录联动
- [x] 多 LLM 支持（Claude/OpenAI/Gemini/Ollama）
- [x] CC switch Claude Key 一键导入
- [x] LLM 连接测试 + 模型列表获取
- [x] 自定义 API base_url（中转 API）
- [x] 生成确认对话框（选模型 + 填提示词）
- [x] 流式生成纪要
- [x] 多轮对话修改纪要
- [x] 多格式导出（Obsidian/PDF/Word/图片/MD/复制）
- [x] 历史会议搜索
- [x] 首次启动引导
