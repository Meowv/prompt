<div align="center">

# 增强提示词 · Prompt Enhancement

**在发送之前，把想法变成更清晰、更完整、可执行的提示词。**

一个面向 [Codex++](https://github.com/BigPizzaV3/CodexPlusPlus) 的轻量用户脚本，在 Codex 输入框内一键增强提示词，由你检查后自行发送。

![Version](https://img.shields.io/badge/version-1.0.0-2563eb)
![Runtime](https://img.shields.io/badge/runtime-Codex%2B%2B-111827)
![API](https://img.shields.io/badge/API-OpenAI%20Compatible%20%7C%20Anthropic-0d9488)

[功能特性](#功能特性) · [快速安装](#快速安装) · [API 配置](#api-配置) · [使用方法](#使用方法) · [常见问题](#常见问题)

</div>

> [!IMPORTANT]
> 增强请求由你配置的独立模型 API 处理，不会作为消息发送到当前 Codex 对话。增强结果也不会自动发送。

## 功能特性

- **一键增强**：补充任务目标、范围、约束和预期输出，尽量保留原意与原语言。
- **检查后发送**：在输入框中查看、修改增强结果；未修改时可还原原稿。
- **独立模型 API**：支持 OpenAI 兼容的 Chat Completions 和 Anthropic Messages 协议，并提供连接测试。
- **保守回填**：检查代码、路径、URL 等受保护内容，以及草稿、附件和编辑器状态；不适合回填时提供结果预览和复制。
- **其他交互**：支持取消请求、主题适配和脚本重新加载。

### 效果示例

**增强前：**

> 帮我优化一下这段 C# 代码。

**增强后（示意）：**

> 请分析这段 C# 代码的功能、主要执行流程和潜在问题。在不改变现有业务行为及对外接口的前提下，优先从可读性、可维护性和性能方面提出改进，并给出必要的修改代码。请说明关键改动的原因、可能的兼容性风险，以及建议的验证方式。

模型的实际输出可能不同，请自行检查补充的要求是否符合意图。

## 快速安装

### 前置条件

- 已安装并启用支持用户脚本的 [Codex++](https://github.com/BigPizzaV3/CodexPlusPlus) 和 Codex Desktop。
- 准备支持对应协议的模型 API、API Key 和模型 ID。

这是 Codex++ 用户脚本，不是 Codex 原生插件或浏览器油猴脚本，也不需要修改 Codex Desktop 安装文件。

### macOS / Linux

```bash
mkdir -p "$HOME/.config/Codex++/user_scripts"
curl -fL \
  'https://raw.githubusercontent.com/Meowv/prompt/main/prompt-enhancement.js' \
  -o "$HOME/.config/Codex++/user_scripts/prompt-enhancement.js"
```

以上使用常见的 `~/.config/Codex++/user_scripts` 目录；如果 Codex++ 显示的用户脚本目录不同，请以其显示的目录为准。

### Windows

在 PowerShell 中执行：

```powershell
$target = "$env:APPDATA\Codex++\user_scripts\prompt-enhancement.js"
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Meowv/prompt/main/prompt-enhancement.js" -OutFile $target
```

安装位置为 `%APPDATA%\Codex++\user_scripts\prompt-enhancement.js`。

### 启用与更新

1. 打开 Codex++ 的用户脚本管理页面，刷新本地脚本列表，确认用户脚本功能及 `prompt-enhancement.js` 已启用。
2. 执行「重新加载用户脚本」，或重新启动 Codex++ / Codex Desktop。
3. 打开可输入消息的 Codex 对话，输入文字后确认输入框底部出现「增强提示词」按钮。空白草稿时隐藏；上一轮对话仍在执行时也可使用。

更新时可再次运行对应的安装命令覆盖脚本，再重新加载用户脚本。若已下载仓库，也可将其中的 `prompt-enhancement.js` 复制到用户脚本目录。

## API 配置

右键点击「增强提示词」打开设置；未配置时，首次左键点击也会打开设置。

| 配置项   | 说明                                             | 示例                        |
| -------- | ------------------------------------------------ | --------------------------- |
| API 协议 | `OpenAI 兼容` 或 `Anthropic`                     | `OpenAI 兼容`               |
| API 地址 | HTTPS 地址，不能包含用户名、密码、查询参数或片段 | `https://api.openai.com/v1` |
| API Key  | 模型服务的访问密钥                               | `YOUR_API_KEY`              |
| 模型名称 | 服务商支持的模型 ID                              | 以服务商文档为准            |

脚本会在基础地址后补全接口路径：OpenAI 兼容协议使用 `/chat/completions`，Anthropic 使用 `/messages`。地址没有路径时会先补上 `/v1`；如果地址已有路径，则在现有路径后追加接口路径。也可填写完整接口地址。Anthropic 官方地址例如 `https://api.anthropic.com/v1`。

填写后可先点击「测试连接」，再点击「保存配置」。测试会向配置的服务发送请求，可能产生 API 用量；测试成功也不保证后续所有请求都能成功。第三方服务的协议、模型和鉴权兼容性取决于服务商。

## 使用方法

1. 在 Codex 输入框中输入原始提示词。
2. 点击「增强提示词」，等待模型返回结果。请求期间输入框暂时只读，再次点击按钮可取消请求；单次请求超时为 60 秒。
3. 如果结果通过检查且写入得到确认，脚本会回填输入框。请检查或继续修改，然后自行发送。
4. 如果增强结果尚未修改，可点击「还原」恢复原稿。遇到不适合自动回填或无法确认写入的情况，按预览提示检查并复制结果。

脚本使用内置增强规则，不需要选择优化风格。模型输出及自动检查均不能保证语义正确，尤其应核对代码、文件路径和新增约束。

## 隐私与限制

- **提示词会发送给你配置的模型 API 服务**；提交敏感代码或业务数据前，请了解该服务的隐私政策。
- API Key 和其他配置保存在当前 Codex 渲染环境的 `localStorage`，键名为 `ax.promptEnhancer.config.v1`。该存储并非操作系统安全凭据库，脚本也未对配置额外加密。
- 点击「增强提示词」或「测试连接」会发起对应 API 请求。使用量和计费由所选服务商决定。
- 还原记录保存在运行时内存中，不是永久草稿备份；重新加载页面或重启应用后不保证仍可还原。
- 脚本依赖宿主请求桥接和 Codex 输入区结构，宿主更新可能影响兼容性；目前没有完整的版本兼容性矩阵。
- 富文本、附件、代码或路径等内容可能触发保守处理。自动检查只能降低误覆盖风险，不能替代人工检查。

## 常见问题

**安装后看不到按钮？**

确认 Codex++ 的用户脚本功能和本脚本均已启用，脚本位于管理页面显示的用户脚本目录中。重新加载脚本，必要时重启 Codex++ / Codex Desktop；按钮只会在脚本定位到可用输入区时出现。

**为什么没有直接替换草稿？**

特殊编辑器节点、草稿或附件状态变化、受保护内容变化以及写入结果不确定等情况都可能触发保守处理。请按界面提示检查原稿和预览，再决定是否复制结果。

**提示「当前宿主没有可用的独立 API 请求通道」？**

脚本需要宿主提供的请求桥接。请确认通过支持用户脚本及相应请求通道的 Codex++ / Codex Desktop 环境运行，而非普通网页或浏览器油猴环境。

**API 返回错误或请求超时？**

- `400`：检查协议、模型及服务支持的请求参数。
- `401 / 403`：检查 API Key、账号权限和模型访问权限。
- `404`：检查 API 地址、接口路径和模型 ID。
- `429`：检查服务商的速率和额度限制。
- 超时：脚本在 60 秒后取消请求；检查网络及服务状态后重试。

**如何停用或卸载？**

在 Codex++ 中禁用脚本，或删除用户脚本目录中的 `prompt-enhancement.js`，然后重新加载脚本；如效果仍存在，重新加载页面或重启应用。删除脚本不会清除已保存的 API 配置；如需清理，需在对应 Codex 渲染环境中删除 `localStorage` 的 `ax.promptEnhancer.config.v1` 项。

---

<div align="center">

**Prompt Enhancement** · Maintained by [Meowv](https://github.com/Meowv)

_An unofficial Codex++ userscript. Not affiliated with OpenAI or the Codex++ maintainers._

</div>
