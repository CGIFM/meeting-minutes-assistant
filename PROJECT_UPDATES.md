# 会议纪要助手 - 更新日志

## 2026-06-26 v1.5 实时录音修复 + AI 起标题 + diff 修正

### 实时录音彻底修复
- **根因**：Swift GUI 启动 Python 时 PATH 不含 `/opt/homebrew/bin`，ffmpeg 找不到，每段 chunk 转码都失败，前端只能转圈
- 启动时主动注入 homebrew 路径；新增 `_find_ffmpeg()` 兜底找绝对路径
- chunk 时长 3s → 5s（VAD 切得更准）
- 移除"等待说话"的转圈，改成静态提示 + 副标题显示"已识别 N 句"
- 新 segment 来时自动滚动到底部

### AI 修正 diff 错位修复
- 原因：按数组索引匹配 old/new，AI 合并/拆分段时索引错位（红色划掉和下面绿色对不上）
- 改用"时间戳最近匹配"（5 秒阈值），diff 严格按原段索引

### "✓ 确认修正" 按钮
- 用户审完 diff 后一键清掉红色高亮，保留新文本（undo 栈仍可撤回）

### AI 自动起标题
- 转录完成后自动调用（仅在文件名是默认值时才改）
- Sidebar 每条左侧加 ✨ 按钮：手动强制重生标题
- 后端 `POST /api/generate-title`（force=true 强制重生）

## 2026-06-26 v1.4 内存优化 + 麦克风选择 + 系统音频录制

### 内存优化
- ASR 模型空闲 5 分钟自动卸载（watchdog 后台线程）
- 模型加载改用本地缓存绝对路径，绕过 modelscope SSL/registry 问题（启动从 90s→3s）
- 双重检查锁防止 chunk ASR + full ASR 并发重复加载

### 录音功能增强
- **麦克风选择下拉框**：自动枚举所有输入设备，用户可指定使用哪个麦克风
- **系统音频录制**：检测 BlackHole 虚拟声卡，勾选后混流麦克风+系统音频（适合在线会议）
- Web Audio API 混流 + 多流统一清理（allStreamsRef）
- 录音面板改为用户手动点击"开始录音"（不再自动启动）

### 修复
- 实时录音卡转圈：React ref 同步问题，状态 setter 异步导致 startCycle 拿到 stale state
- 后端日志 0 字节：basicConfig 被 uvicorn 抢先配置，改手动 clear+add handlers
- "录音处理失败"：get_audio_duration 解析 WebM 缺 duration tag，加多级 fallback
- 录音合并：用 ffmpeg concat demuxer 替代字节拼接，产出带正确 duration 的容器

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
