# 通用部署与运行说明

本文档集中说明本地运行、CI 运行、配置方式和通知接入。README 只保留概览，这里承接部署细节。

## 运行模式

### 本地常驻

```powershell
npm install
npm run dev
```

### 单次执行

```powershell
$env:ONE_SHOT="true"
node src/index.js
```

## 核心环境变量

- `ONE_SHOT`：设为 `true` 时只执行一次
- `CI`：设为 `true` 时等价于单次执行
- `REPO_PATH`：目标 Git 仓库路径
- `REVIEW_MODE`：当前支持 `daily`
- `REVIEW_SINCE`：手动指定审查起点，支持毫秒时间戳或 ISO 时间
- `AI_PROVIDER`：`openai` / `ollama` / `http`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`

## 配置优先级

1. 环境变量
2. `config/config.json`
3. 代码默认值

## Provider 配置

### OpenAI

```json
{
  "model": {
    "provider": "openai",
    "options": {
      "apiKey": "${AI_API_KEY}",
      "model": "${AI_MODEL}",
      "baseURL": "${AI_BASE_URL}"
    }
  }
}
```

### Ollama

```json
{
  "model": {
    "provider": "ollama",
    "options": {
      "endpoint": "http://localhost:11434/api/generate",
      "model": "qwen2.5-coder:latest"
    }
  }
}
```

### HTTP

```json
{
  "model": {
    "provider": "http",
    "options": {
      "baseURL": "${AI_BASE_URL}",
      "apiKey": "${AI_API_KEY}",
      "authHeaderPrefix": "Bearer "
    }
  }
}
```

## 通知配置

### 飞书

- Webhook 模式：配置 `notifications.lark.webhook`
- App 模式：配置 `appId`、`appSecret`，并提供 `chatId` 或邮箱到 `open_id` 的映射

### 企业微信

- 配置 `notifications.wecom.webhook`
- 可通过 `mention_map.email_to_wecom_userid` 实现精确 @ 作者

### 邮件

需要以下字段：

- `notifications.email.from`
- `notifications.email.smtp.host`
- `notifications.email.smtp.port`
- `notifications.email.smtp.secure`
- 如需认证，再配置 `smtp.user` 与 `smtp.pass`

## 常用评审参数

- `review.maxSnippetsPerCommit`
- `review.maxLinesPerSnippet`
- `review.include`
- `review.exclude`
- `review.codeExtensions`：判定“代码文件”的扩展名列表（决定提交是否进入审查）。默认已覆盖常见语言（JS/TS、Java、Go、C/C++、C#、Python、Rust 等）。仅当默认集合未包含目标语言时才需配置，例如 `["go", "proto"]`；留空或省略则使用默认集合。

## 工程索引（降低 AI 误判）

AI 审查只看到本次提交的 diff 片段，看不到完整文件或其他脚本，因此对“资源是否释放、变量是否使用、跨文件契约”等需要全局信息的问题容易误报。为此在**首次审核时会构建一份工程索引**（源文件清单 + 函数/方法/类型等定义符号的 `符号→文件` 映射），并把与本次变更相关的跨文件线索随提示词一起提供给模型；模型据此可判断某符号是否在他处定义/释放，从而避免臆测式缺陷。

- 索引构建会**输出进度**（`[index] 已扫描 X/Y 文件...`），完成后写入 `state/project-index-*.json` 缓存；之后命中缓存直接复用，仅当源文件集合变化（增删文件）时重建。
- 默认忽略 `node_modules`、`vendor`、`dist`、`build`、`bin`、`obj`、`target` 等依赖/产物目录。
- 配合“高精度优先”的提示词：相关符号若在索引中出现于其他文件，模型默认其生命周期可能由他处负责，不据此报缺陷（宁可漏报不臆测）。

相关配置（`review.context.index`）：

- `enabled`：是否启用工程索引，默认 `true`
- `maxFiles`：最多索引多少个源文件，默认 `3000`
- `maxSymbolsPerFile`：每个文件最多提取多少符号，默认 `40`
- `exclude`：额外忽略的目录段（数组），追加到默认忽略列表之上

## 抓取分支

- 默认**自动抓取目标仓库当前所处的分支**（`HEAD` 所在分支），并一并纳入其远程跟踪分支（如 `origin/<branch>`），以便捕获已推送但本地未合并的提交；不会再扫描所有分支。
- `repo.branch`：显式指定要审查的分支，覆盖自动检测。例如：

  ```json
  { "repo": { "path": "${REPO_PATH}", "branch": "develop" } }
  ```

  留空或省略则按当前分支自动抓取。detached HEAD 且未配置该项时，回退为按当前 `HEAD` 抓取。

## 规则文件

规则位于 `rules/*.md`，通过 frontmatter 的 `review` 字段区分两类：

- `review: ai`（或无 frontmatter 的旧文件）：正文会被合并进 AI 模型提示词。
- `review: builtin`：用于激活内置静态检查（高置信，**仅作用于 JS/TS**），通过 `checks` 列出要启用的检查项；其正文不进入 AI 提示词。

AI 规则示例：

```md
---
review: ai
---
# Naming
- 函数命名使用动宾结构

# Error Handling
- 外部调用必须处理超时和失败
```

内置静态检查示例（`checks` 取值见下）：

```md
---
review: builtin
checks:
  - secrets-in-logs
  - null-safety
  - resource-cleanup
---
```

> 内置检查 `secrets-in-logs`（日志泄露敏感信息）、`null-safety`（空 catch / 未保护的 JSON.parse / 缺失 Promise catch）、`resource-cleanup`（useEffect 定时器与事件监听未清理）均基于 JS/TS 语义，对其他语言不生效。

## 运行建议

- CI 内使用平台调度，不依赖工具内部 cron
- 大仓库优先配置 `review.include` / `review.exclude`
- 外部模型优先控制 snippets 数量，避免 413
- 邮件、Webhook、密钥全部放到 Secrets / Variables

## Windows 注意事项

- 若 PowerShell 执行策略限制 `npm`，可用 `cmd /c npm install`
- 路径中使用反斜杠时注意转义，例如 `C:\Repos\Project`
