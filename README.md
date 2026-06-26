<div align="center">

# 会议纪要助手

**AI 驱动的 macOS 本地会议转录 + 纪要生成桌面应用**

拖入音频或现场录音 → 自动转录（中文优化 + 说话人分离）→ 一键生成会议纪要 → 多轮对话修改 → 导出 Markdown / PDF / Word / Obsidian

[功能](#-核心功能) · [截图](#-截图) · [安装](#-安装) · [技��架构](#-技术架构) · [开发](#-开发) · [License](#-license)

</div>

---

## ✨ 设计理念

市面上的会议纪要工具要么把音频传到云端（隐私风险）、要么生成的纪要假大空（AI 幻觉严重）。这个项目想做一款：

- **本地优先** — ASR、说话人分离全在本地 CPU/GPU 跑，音频不出机器
- **中文优先** — 用阿里 FunASR SenseVoice，中文精度远超 Whisper
- **零幻觉** — 提示词强制"忠实原文、禁止脑补"，每条要点可追溯到原文
- **小而美** — Swift + WKWebView 原生壳，安装包 ~30MB，启动 < 1 秒

## 🎯 核心功能

### 转录
- 🎙️ **拖入音频文件** 或 **现场录音**，全自动流水线
- 🇨🇳 **SenseVoice 中文优化**，自动纠错专有名词（支持热词）
- 👥 **CAM++ 说话人分离**，自动区分"说话人1/说话人2"
- ⏱️ **时间戳精准对齐**，点击纪要跳转原文
- 📝 **可编辑转录**，改错字、合并段落，撤销栈支持
- ⚡ **实时录音边录边识别**，停止后跑完整流水线替换临时结果

### 纪要生成
- 🤖 **多 LLM 后端**：Claude / OpenAI / Gemini / Ollama（本地）
- 📋 **严格提示词模板**：6 大块结构（概述/要点/决策/行动项/备注）
- 🔄 **多轮对话修改**：生成后可继续追问（"按优先级重排"、"压缩到一页"）
- 🎯 **CC switch 联动**：自动接入 [Claude Code Switch](https://github.com/farion1231/cc-switch) 本地路由，切换 provider 自动跟随

### 导出
- 📝 Markdown / 📄 PDF / 📚 Word (.docx) / 🖼️ PNG 长图 / 📋 剪贴板
- 🔖 **Obsidian** 一键存入 vault，带 frontmatter 标签

### 体验
- 🍎 macOS 原生窗口（Swift + WKWebView），比 Electron 轻 10 倍
- 💾 自动保存 + 脏标标记，崩溃不丢数据
- 🎚️ **麦克风选择** + **系统音频录制**（BlackHole，开在线会议也能用）
- 🧠 **空闲自动卸载模型**，5 分钟不用就释放内存

## 📸 截图

> 主界面：左侧历史会议列表 / 中间转录（时间戳+说话人）/ 右侧纪要+对话

```
┌─────────────────────────────────────────────────────────────┐
│  📚 历史会议    │   📑 转录文本          │   ✨ 会议纪要      │
│                │                       │                   │
│ ▶ 产品周会     │   [00:00] 说话人1:     │   ## 会议概述      │
│   技术评审     │   我们今天讨论三件事…  │   - 参会人：...    │
│   客户访谈     │                       │                   │
│                │   [00:32] 说话人2:     │   ## 讨论要点      │
│                │   第一个是 Q3 路线图   │   ### 路线图       │
│                │                       │                   │
│                │   [01:15] 说话人1:     │   ## 行动项        │
│                │   我们决定先做 X       │   | 任务 | 负责人 | │
│                │                       │                   │
│  🎙️ 开始录音   │   ⏯️ 播放  ✏️ 编辑    │   💬 追问修改...   │
└─────────────────────────────────────────────────────────────┘
```

## 📦 安装

### 方式一：下载预编译 App（推荐普通用户）

前往 [Releases](../../releases) 下载 `会议纪要助手.app.zip`，解压后拖入 `/Applications` 即可。

首次启动需在「设置」中填入 LLM API Key。

### 方式二：本地构建（推荐开发者）

**前置要求**：macOS 14+ / Apple Silicon 或 Intel / Xcode Command Line Tools / Python 3.12 / Node.js 20+

```bash
git clone https://github.com/<your-username>/meeting-minutes-assistant.git
cd meeting-minutes-assistant

# 1. 安装前端依赖
npm install

# 2. 安装后端依赖（建议用 venv）
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. 首次运行会自动下载 ASR 模型（~500MB，后续走本地缓存）
bash dev.sh
```

打开浏览器访问 `http://localhost:5173`，或运行 `npm run build:app` 构建独立 .app。

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────┐
│   会议纪要助手.app（Swift + WKWebView）       │
│              ↕ HTTP/WebSocket                │
│  ┌────────────────────────────────────┐     │
│  │  React 19 + TailwindCSS + Zustand  │     │
│  │  （打包进 app bundle）              │     │
│  └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────────────┐
│         Python FastAPI Backend               │
│  ┌──────────┬──────────┬──────────────┐    │
│  │ FunASR   │ ffmpeg   │ LLM Provider │    │
│  │ SenseVoice│ 转码     │ Claude/GPT/  │    │
│  │ + CAM++  │ 切片     │ Gemini/Ollama│    │
│  │ + FSMN   │          │              │    │
│  │   VAD    │          │              │    │
│  └──────────┴──────────┴──────────────┘    │
│         SQLite（会议历史 + 设置）             │
└─────────────────────────────────────────────┘
```

### 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| ASR 引擎 | FunASR SenseVoiceSmall | 中文 CER < 3%，远超 Whisper；支持热词；本地推理 |
| 说话人分离 | CAM++（FunASR 内置） | EER 0.65%，无需训练即可用 |
| 加速设备 | MPS（Apple Silicon GPU）| 比 CPU 快 3-5x，回退 CPU 自动 |
| 长音频 | VAD 分段 + `batch_size_s=300` | 60 分钟音频分 12 批处理，边处理边推进度 |
| LLM 流式 | httpx AsyncClient + WebSocket | 实时渲染，无卡顿 |
| 桌面壳 | Swift WKWebView | 安装包 ~30MB（Electron 同类 200MB+），原生体验 |
| 数据存储 | SQLite + aiosqlite | 单文件数据库，零运维 |

## 📁 项目结构

```
meeting-minutes-assistant/
├── native/                    # Swift 原生壳（替代 Electron）
│   ├── main.swift             # WKScriptMessageHandler 桥接
│   └── Info.plist
├── src/                       # React 前端
│   ├── App.tsx
│   ├── components/            # 录音/转录/纪要/设置面板
│   ├── stores/appStore.ts     # Zustand 全局状态
│   └── services/              # api / websocket
├── backend/                   # Python FastAPI
│   ├── main.py                # 入口 + lifespan
│   ├── routers/               # transcribe / record / llm / settings / export
│   ├── services/
│   │   ├── asr_engine.py      # FunASR 封装 + 空闲卸载
│   │   ├── audio_processor.py # ffmpeg 转 WAV
│   │   ├── llm_provider.py    # 多 LLM 流式
│   │   └── prompt_templates.py
│   └── db/database.py         # aiosqlite
├── build-mac-app.sh           # 一键构建 .app
├── dev.sh                     # 开发启动脚本
└── PROJECT_UPDATES.md         # 详细更新日志
```

## 🛠️ 开发

```bash
# 前端热重载
npm run dev

# 后端单独跑（debug 模式）
cd backend && source .venv/bin/activate
python main.py

# 构建 .app（前端先 build 再打包）
npm run build:app

# 输出在 ~/Applications/会议纪要助手.app
```

后端日志：`~/Library/Logs/meeting-minutes-assistant/backend.log`
本地数据：`~/Library/Application Support/meeting-minutes-assistant/`

## 🔧 配置

### LLM Provider

在「设置」页面填入 API Key 即可。支持：

| Provider | 推荐模型 | 备注 |
|----------|---------|------|
| Claude | `claude-sonnet-4-20250514` | 默认推荐，纪要质量最高 |
| OpenAI | `gpt-4o` / `gpt-4o-mini` | 通用 |
| Gemini | `gemini-2.0-flash` | 免费额度 |
| Ollama | `qwen2.5:14b` 等 | 完全本地，无需 API Key |

### 系统音频录制（可选）

录制在线会议（腾讯会议/Zoom/Meet）的系统声音：

1. 安装 [BlackHole](https://existential.audio/blackhole/)（开源虚拟声卡）
2. 在「设置 → 音频」勾选「同时录制系统音频」
3. 选择 BlackHole 设备作为输入
4. 在 macOS「音频 MIDI 设置」中创建"多输出设备"，把 BlackHole + 扬声器都加进去

### 热词

在「设置」中添加专有名词（每行一个），ASR 会优先识别这些词。适合公司产品名、技术栈、人名等。

## 📈 性能

在 M4 Pro MacBook Pro 上的实测：

| 场景 | 数据 |
|------|------|
| 27 分钟中文音频转录 | ~50 秒（MPS 加速）|
| 首次启动加载模型 | ~3 秒（本地缓存命中后）|
| 空闲内存占用 | ~70 MB（模型已卸载）|
| 工作内存（转录中） | ~800 MB |
| 安装包大小 | ~30 MB |

## 🗺️ 路线图

- [x] 实时录音边录边识别
- [x] 多 LLM 后端 + 流式生成
- [x] 多格式导出（MD/PDF/Word/PNG/Obsidian）
- [x] 空闲自动卸载模型
- [x] 麦克风选择 + 系统音频录制
- [ ] Real-time low-latency ASR（用 streaming 模型替代 chunk）
- [ ] 自动识别会议主题并打标签
- [ ] 多语言界面（英文/日文）
- [ ] Linux/Windows 支持

## 📜 更新日志

详见 [PROJECT_UPDATES.md](PROJECT_UPDATES.md)。

## 🤝 贡献

欢迎提 Issue 和 PR。重大改动请先开 Issue 讨论方案。

## 📄 License

MIT License — 详见 [LICENSE](LICENSE)

## 🙏 鸣谢

- [FunASR](https://github.com/modelscope/FunASR) — 阿里达摩院开源 ASR 引擎
- [CAM++](https://github.com/alibaba-damo-academy/3D-Speaker) — 说话人分离
- [FastAPI](https://fastapi.tiangolo.com/) — 后端框架
- [React](https://react.dev/) + [TailwindCSS](https://tailwindcss.com/) — 前端栈
- [BlackHole](https://existential.audio/blackhole/) — 系统音频虚拟声卡

---

<div align="center">

**如果这个项目对你有帮助，⭐ Star 支持一下**

</div>
