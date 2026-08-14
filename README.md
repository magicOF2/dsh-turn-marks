<div align="center">

# 📌 dsh-turn-marks

**会话左侧消息标记条 · Turn Marks for DSH Chat** — 为 DeepSeek Harness Web UI 增加
Claude Code / Codex 桌面端同款「左侧消息条条」：每发一条消息就多一根小条，
点击跳转到该消息，悬停预览内容，当前消息对应的条条变白。

[![Version](https://img.shields.io/badge/version-0.1.1-blue)](https://github.com/magicOF2/dsh-turn-marks)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-web-lightgrey)](https://github.com/magicOF2/dsh-turn-marks)

</div>

---

## ✨ 特性 / Features

- **每段一条**：你在会话里每发送一条消息（用户消息 / turn），左侧就多一根灰色小条
- **密集排列**：条条间距紧凑（上限 24px），消息少时聚拢在轨道中部，消息多时自适应填满，方便点选
- **点击跳转**：点任意一根条条，会话框平滑滚动，让那条消息**对齐视口最上方**（内容不足时尽可能靠上并完整显示下方内容）
- **选中变白**：点击过的（以及当前正显示在视口里的）条条变成白色，其余保持灰色
- **悬停预览**：鼠标悬停在条条上，弹出气泡显示该条消息的时间与内容预览（前 180 字）
- **跟随滚动**：手动滚动会话时，白色条条会自动跟随当前视口内的消息
- **零配置**：纯浏览器端插件，无 Host 逻辑、无外部依赖、无网络请求
- **主题友好**：颜色全部使用 DSH 主题 CSS 变量，浅色 / 深色模式自动适配
- **增量挂载**：注册在 `conversation.input.dock` 槽位，不替换任何原生组件，卸载干净

## 🎯 界面位置 / Where it lives

条条悬浮在**对话内容区左边缘**（消息流与窗口左缘之间的空隙），纵向等距排列，
像一根滚动条轨道一样贯穿整个会话高度：

```
┌────────────┬────────────────────────────────────────────┐
│  侧边栏     │  💬 会话标题            [对话] [轨迹]         │
│            ├────────────────────────────────────────────┤
│            │                                             │
│   ▍        │  第一条消息……                               │
│   ▍        │  回复                                       │
│   ▍        │  第二条消息……                               │
│   ▍        │  回复                                       │
│            │                                             │
│            │  ┌──────────────────────────────────────┐  │
│            │  │ 输入框                                 │  │
│            │  └──────────────────────────────────────┘  │
└────────────┴────────────────────────────────────────────┘
```

## 📦 安装 / Installation

### 方式一：从 GitHub 安装（推荐给其他用户）

```sh
dsh plugin --profile web add https://github.com/magicOF2/dsh-turn-marks.git
```

### 方式二：本地开发 / 自用（链接方式）

```sh
git clone https://github.com/magicOF2/dsh-turn-marks.git ~/.dsh/external/dsh-turn-marks

dsh plugin --profile web add link:C:/Users/<你的用户名>/.dsh/external/dsh-turn-marks
```

> ⚠️ **安装后需要重启 `dsh web`**，并在浏览器里 **Ctrl+Shift+R** 强制刷新一次。
> 之后插件随 GUI 自动加载，**无需任何手动启用**。

## 🖱️ 使用 / Usage

1. 打开任意会话，发送几条消息 → 对话左侧出现对应数量的灰色小条
2. **点击**任意一条 → 会话平滑滚动到那条消息，条条变白
3. **悬停**任意一条 → 弹出该消息的预览气泡（编号 + 时间 + 内容前 180 字）
4. 手动上下滚动 → 白色条条自动跟随视口内当前的消息

## 🔧 工作原理 / How it works（技术设计）

> 难度评估：**低**。这是一个纯前端（浏览器端）的增量 UI 插件，约 200 行代码，
> 不需要 Host 逻辑、不需要后端、不需要持久化。核心就是「数据 + 定位 + 交互」三件事。

### 1. 数据来源：会话快照（Conversation Snapshot）

插件挂载在 **`conversation.input.dock`** 槽位（会话输入区上方的一个增量行）。
该槽位的 owner 会传入 `session: ConversationSnapshot`（每次会话快照变化都会
自动重新渲染），因此插件**无需任何订阅/轮询**即可拿到实时数据：

- 用户消息 = `session.nodes` 中 `kind === 'user'` 的节点（`UserMessageNode`）
- 每个节点含 `seq`（序号）、`time`（时间戳）、`content`（内容块数组）

### 2. 定位：稳定 DOM 锚点 + 滚动数学

会话界面（`dsh-client-ui-conversation`）渲染时带有稳定的数据标记：

| 标记 | 含义 |
| --- | --- |
| `[data-conversation-scroll]` | 会话的滚动容器（scrollport） |
| `[data-chat-flow-kind="user"]` | 每一条用户消息行 |
| `[data-composer-seat]` | 底部输入区座位（用于计算条条轨道底部） |

- 条条轨道是 **`position: fixed`** 的悬浮条，贴住 scrollport 左缘；
  用 `ResizeObserver` + `resize` 事件重新测量几何，保证窗口/布局变化后仍对齐
- **密集排列**：条条按中心距 ≤ `BAR_SPACING`（24px）排列——消息少时紧凑聚拢
  （整簇在轨道内垂直居中），消息多时间距自动收缩填满整条轨道；
  每根条条有 20×20px 的点击热区（可见的 4×14px 圆点居中），好点、好悬停
- **点击跳转**：`row.getBoundingClientRect().top - port.getBoundingClientRect().top`
  得到该消息在 scrollport 内的偏移，滚动目标为
  `min(max(0, scrollTop + offset - TOP_MARGIN), scrollHeight - clientHeight)`
  —— 消息对齐视口顶部（留 8px 边距）；若下方内容不足以填满视口，
  则钳制到最大滚动位置，让消息尽可能靠上、下方内容完整可见

### 3. 交互：白条跟随 + 悬停预览

- **点击**：跳转并把该条标记为 active（变白）
- **滚动跟随**：监听 scrollport 的 `scroll` 事件（rAF 节流），找到视口顶部附近
  的用户消息行，把它的条条置为白色 —— 手动滚动时白条自动同步
- **悬停预览**：从 `content` 块中提取文本（`type: 'text'` 取 `text`，图片显示
  `[图片]`），截断到 180 字，用固定定位气泡显示在条条右侧

### 4. 主题与生命周期

- 颜色全部使用 DSH 主题变量（`--dsw-alias-label-primary/secondary/tertiary`、
  `--dsw-alias-bg-overlay`、`--dsw-alias-border-l2`），深浅色自动适配
- 包级 `<style>` 由插件自建自删；槽位注册随插件 stop 自动移除，无残留

## 🧩 兼容性 / Compatibility

- DeepSeek Harness `0.1.0-rc.6` 及以上（开发环境验证版本），Cordis `4.x`
- 现代浏览器（Chrome / Edge / Firefox / Safari 最新两个大版本）
- 纯前端实现，不依赖任何 API Key、无数据上传

## 🛠️ 开发 / Development

```
dsh-turn-marks/
├── lib/
│   ├── index.js     Host 入口（空实现，仅占位 —— 纯前端插件）
│   └── client.js    浏览器端 bundle（__ModuleLoader__ 格式）
├── cordis.patch.yml profile 组合层插入条目
├── package.json     包清单（dsh.bundle / dsh.client 声明）
├── README.md
└── LICENSE          MIT
```

**本地迭代**：

```sh
# 改完 lib/client.js 后，重启 dsh web + 浏览器强制刷新即可验证
git add -A && git commit -m "your change" && git push   # 同步到 GitHub
```

**可调参数**（`lib/client.js` 顶部常量）：

| 常量 | 默认 | 含义 |
| --- | --- | --- |
| `GUTTER_INSET` | `6` | 条条轨道距 scrollport 左缘的像素 |
| `GUTTER_TOP` | `16` | 轨道顶部内边距 |
| `BAR_SPACING` | `24` | 条条中心距上限（密集排列） |
| `HIT_SIZE` | `20` | 单根条条的点击热区（px） |
| `BAR_HEIGHT` | `14` | 单根条条可见高度（px） |
| `TOP_MARGIN` | `8` | 点击跳转后消息距视口顶部的边距 |
| `PREVIEW_MAX` | `180` | 预览截断字数 |

## 📄 License

[MIT](LICENSE) © 2026 [magicOF2](https://github.com/magicOF2)

---

## English

A lightweight **DSH (DeepSeek Harness) web plugin** that adds a
**Claude Code / Codex desktop style "turn marks" strip** to the left edge of the
conversation: one small gray bar per user message (turn). Click a bar to
smooth-scroll the chat to that message and turn it **white**; hover a bar to see
a **preview** of that message (number, time, first 180 chars). The white bar
also follows your manual scrolling automatically.

**Highlights**: no host logic · theme-aware (DSH CSS variables) · mounts
additively in the `conversation.input.dock` slot (nothing shipped is replaced) ·
pure front-end (~200 lines) · standard `dsh.bundle` plugin package, loads
automatically after install (no manual enable).

**Install**:

```sh
dsh plugin --profile web add https://github.com/magicOF2/dsh-turn-marks.git
```

Then restart `dsh web` and hard-refresh the browser once.
