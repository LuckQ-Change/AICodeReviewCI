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

## 规则文件

规则位于 `rules/*.md`，每个 Markdown 文件都会被合并进模型提示词。

示例：

```md
# Naming
- 函数命名使用动宾结构

# Error Handling
- 外部调用必须处理超时和失败
```

## 运行建议

- CI 内使用平台调度，不依赖工具内部 cron
- 大仓库优先配置 `review.include` / `review.exclude`
- 外部模型优先控制 snippets 数量，避免 413
- 邮件、Webhook、密钥全部放到 Secrets / Variables

## Windows 注意事项

- 若 PowerShell 执行策略限制 `npm`，可用 `cmd /c npm install`
- 路径中使用反斜杠时注意转义，例如 `C:\Repos\Project`
