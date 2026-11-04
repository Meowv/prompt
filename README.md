<div align="center">

# 增强提示词 · Prompt Enhancement

**在发送前，把想法整理成清晰、完整、可执行的提示词。**

面向 [Codex++](https://github.com/BigPizzaV3/CodexPlusPlus) 的轻量用户脚本，在 Codex 输入框内一键增强提示词，由你检查后自行发送。

![Version](https://img.shields.io/badge/version-1.0.2-2563eb)
![Runtime](https://img.shields.io/badge/runtime-Codex%2B%2B-111827)
![API](https://img.shields.io/badge/API-OpenAI%20Compatible%20%7C%20Anthropic-0d9488)

[功能特性](#功能特性) · [快速安装](#快速安装) · [配置模型](#配置模型) · [附带对话上下文](#附带对话上下文) · [使用方法](#使用方法) · [常见问题](#常见问题)

</div>

> [!IMPORTANT]
> 草稿及你选择附带的上文会发送至配置的独立模型 API。增强请求不会作为消息发送到当前 Codex 对话，增强结果也不会自动发送。

## 功能特性

- **一键增强**：整理任务目标、范围、约束和预期输出，尽量保留原意与原语言。
- **独立模型**：支持 OpenAI 兼容的 Chat Completions 和 Anthropic Messages 协议，可测试连接。
- **可选上下文**：按需附带当前窗格最近 1～4 轮完整问答，帮助理解“继续”“按刚才方案”等表达。
- **保守回填**：检查代码、路径、URL、关键标识符，以及草稿、附件和编辑器状态；无法安全确认时提供预览和复制。
- **可取消、可还原**：请求期间可取消；增强结果尚未修改时可还原原稿。
- **界面适配**：支持明暗主题与窄窗口；空白草稿隐藏按钮并保留占位，减少输入时的布局跳动。

### 效果示例

**增强前：**

> 帮我优化一下这段 C# 代码。

**增强后（示意）：**

> 请分析这段 C# 代码的功能和潜在问题。在保留现有业务行为及对外接口的前提下，改进可读性和性能，给出修改代码，并说明改动原因、兼容性风险和验证方式。

实际结果取决于模型，请检查补充的要求是否符合你的意图。

## 快速安装

### 准备

- 可使用用户脚本和独立 API 请求通道的 Codex++ / Codex Desktop 环境。
- 模型服务的 API 地址、API Key 和模型 ID。

先在 Codex++ 中确认用户脚本目录。以下命令使用示例目录；若与你的环境不同，请修改目标路径后执行。

### macOS / Linux

```bash
mkdir -p "$HOME/.config/Codex++/user_scripts"
curl -fL \
  'https://raw.githubusercontent.com/Meowv/prompt/main/prompt-enhancement.js' \
  -o "$HOME/.config/Codex++/user_scripts/prompt-enhancement.js"
```

### Windows（PowerShell）

```powershell
$target = "$env:APPDATA\Codex++\user_scripts\prompt-enhancement.js"
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Meowv/prompt/main/prompt-enhancement.js" -OutFile $target
```

也可以手动下载 [prompt-enhancement.js](./prompt-enhancement.js)，放入 Codex++ 显示的用户脚本目录。

### 启用与更新

1. 在 Codex++ 用户脚本管理页面刷新列表，启用用户脚本功能和 `prompt-enhancement.js`。
2. 执行「重新加载用户脚本」，必要时重启应用。
3. 打开 Codex 对话并输入文字，确认输入框底部出现「增强提示词」。

更新时，用新版脚本替换同名文件，再重新加载用户脚本。上面的下载命令也可用于覆盖更新。

## 配置模型

输入文字后，右键点击「增强提示词」打开设置；未配置时，首次左键点击也会打开设置。

| 配置项 | 说明 |
| --- | --- |
| API 协议 | `OpenAI 兼容` 或 `Anthropic` |
| API 地址 | HTTPS 地址，不含用户名、密码、查询参数或片段 |
| API Key | 模型服务密钥，例如 `YOUR_API_KEY` |
| 模型名称 | 服务商支持的模型 ID |
| 附带对话上下文 | 默认关闭，保存配置后生效 |
| 携带数量 | 1～4 条，默认 1 条；每条是一轮用户提问与已完成回答 |

填写后点击「测试连接」，确认响应正常，再点击「保存配置」。测试使用当前表单值，不会自动保存，也不会附带对话上下文；测试请求可能产生 API 用量。

### API 地址如何填写

可填写基础地址或完整接口地址，脚本会按所选协议补全路径：

| 协议 | 输入示例 | 实际请求地址 |
| --- | --- | --- |
| OpenAI 兼容 | `https://api.example.com` | `https://api.example.com/v1/chat/completions` |
| OpenAI 兼容 | `https://api.example.com/v1` | `https://api.example.com/v1/chat/completions` |
| Anthropic | `https://api.example.com/v1` | `https://api.example.com/v1/messages` |
| Anthropic | `https://api.example.com/v1/messages` | 保持原地址 |

没有路径时先补 `/v1`；已有路径时在其后追加对应接口后缀；已有正确后缀时不重复追加。地址、协议和模型须与服务商要求一致。

## 附带对话上下文

在设置中开启「附带对话上下文」，选择携带数量并保存。鼠标移入旁边的 **ⓘ** 图标显示说明，移出后隐藏；键盘聚焦图标也可查看。

- **采集时机**：仅在点击增强时读取当前窗格已加载的内容，不加载更多历史。
- **采集范围**：最近 1～4 轮完整问答，按时间顺序发送；轮次不足时使用实际可用数量，进行中的回答跳过，不等待整个 Goal 结束。
- **长度上限**：所选消息正文合计最多 6000 个 Unicode 字符。超过上限时整批省略，不截断发送。
- **正文处理**：保留段落、代码换行和列表、表格边界，排除思考区、工具区、附件、隐藏节点及插件界面；正文中的粘贴或引用内容仍可能被附带。
- **识别失败**：无法确认归属或取得可用完整问答时，提示「未附带上文」，继续增强当前草稿。

内置规则要求模型把上文作为不可信参考，以当前草稿为准，不将助手的猜测当作事实或授权。模型仍可能误解上文，回填后需检查。上下文不写入本地配置、日志或跨请求缓存。

## 使用方法

1. 在输入框中写下原始提示词。
2. 点击「增强提示词」。请求期间当前输入框暂时只读，按钮变为「取消增强」；单次请求超时为 60 秒。
3. 检查回填内容，按需修改，再自行发送。如果无法确认安全回填，脚本会打开结果预览，按提示检查或复制。
4. 增强结果尚未修改时，点击「还原」恢复原稿。

上一轮 Codex 对话仍在执行时也可增强草稿。脚本使用内置增强规则，无需选择优化风格。

## 常见问题

### 安装后看不到按钮？

先输入非空白文字，再检查脚本是否放入 Codex++ 显示的目录、用户脚本功能和本脚本是否启用。重新加载用户脚本，必要时重启应用。按钮需要脚本成功识别当前输入区才会出现。

### 为什么只显示预览，没有替换草稿？

草稿、会话、附件或编辑器发生变化，存在特殊节点，或模型改变受保护内容时，脚本会保守处理。若提示无法确认写入状态，请先检查输入框，避免重复粘贴。

### 为什么没有附带上文？

确认开关已保存，且当前窗格存在已加载的完整问答。无法识别归属、回答尚未完成、缺少提问或正文超过上限时，可能不附带上文。完成判定依赖消息操作区，宿主界面更新也可能影响识别。

### 提示请求通道不可用？

脚本依赖宿主提供的独立 API 请求桥接。它是 Codex++ 用户脚本，需要支持对应通道的宿主环境；仅修改 API 配置无法修复缺失的通道。

### API 返回错误或超时？

| 提示 | 检查方向 |
| --- | --- |
| `400` | 协议、模型和请求参数是否受支持 |
| `401 / 403` | API Key 是否有效、账号是否有权限 |
| `404` | API 路径和模型 ID 是否正确 |
| `429` | 频率、额度或余额限制 |
| 超时 | 网络、API 地址及宿主连接；请求在 60 秒后取消 |

测试连接成功不保证后续增强请求都成功，第三方服务的兼容性取决于服务商。

### 如何停用或卸载？

在 Codex++ 中禁用脚本，或删除用户脚本目录中的 `prompt-enhancement.js`，再重新加载用户脚本；必要时重启应用。删除脚本不会清除已保存的 API 配置，如需清理，可在对应渲染环境中删除 `localStorage` 的 `ax.promptEnhancer.config.v1` 项。

## 隐私与限制

- **草稿及选定上文会发送至你配置的模型服务**，请自行确认其中是否包含敏感信息，并了解服务商的隐私政策和计费方式。
- API Key 和其他配置保存在当前渲染环境的 `localStorage`，键名为 `ax.promptEnhancer.config.v1`，未额外加密，也不属于操作系统安全凭据库。
- 还原记录仅保存在运行时内存中；重新加载页面或重启应用后不保证可还原，不能作为永久草稿备份。
- 脚本依赖宿主桥接和输入区结构，宿主更新可能影响兼容性，目前没有完整的版本兼容性矩阵。
- 自动检查不能保证模型语义正确，也不能替代人工核对，尤其需检查代码、路径和新增约束。

## 开发验证

单元回归：

```bash
node --test tests/*.test.cjs
```

浏览器回归需要环境中可用的 Playwright 与 Chromium：

```bash
node --test tests/*.browser.cjs
```

可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定兼容的 Chromium 可执行文件。用例使用合成页面、配置与模拟响应，不读取真实会话或调用模型 API，覆盖请求通道、配置保存、上下文采集、回填保护、按钮显隐、悬停说明和输入性能。通过这些用例不代表已完成真实宿主或模型服务联调。

上下文效果评估样例见 [recent-context-evaluation.json](./tests/fixtures/recent-context-evaluation.json)，包含 10 条依赖上文和 10 条独立指令。使用同一模型和参数对比有、无上下文的输出，随机标注并在评分后揭盲，检查相关性、约束保留、无依据授权和旧话题混入。单次评审不能代表模型的稳定表现。

---

<div align="center">

**Prompt Enhancement** · Maintained by [Meowv](https://github.com/Meowv)

_An unofficial Codex++ userscript. Not affiliated with OpenAI or the Codex++ maintainers._

</div>
