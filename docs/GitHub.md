# GitHub Actions 接入指南

本指南演示如何将 AI Code Review 工具接入 GitHub Actions，实现按日定时或按事件触发的单次审核流程，并通过飞书、企业微信或邮件通知作者。

## 关键设计
- 单次运行：设置 `ONE_SHOT=true` 或使用平台自带 `CI=true`，工具仅执行一次并跳过内部定时器。
- 时间窗口：
  - 每日定时：设置 `REVIEW_MODE=daily`，自动审核“当天 00:00 到定时点”的提交。
  - 自定义窗口：设置 `REVIEW_SINCE` 为毫秒时间戳或 ISO 时间字符串，手动指定起点。
- 仓库路径：设置 `REPO_PATH=${{ github.workspace }}`。
- 状态缓存：可用 `actions/cache` 缓存 `state/` 目录，实现增量审核（可选）。

## 基本工作流（每日 18:00 定时 + 飞书通知）
在仓库创建文件 `.github/workflows/ai-code-review.yml`：

```yaml
name: AI Code Review

on:
  schedule:
    - cron: "0 18 * * *"   # 每天18:00触发（UTC）
  workflow_dispatch:         # 支持手动触发

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      # 如需增量审核，恢复 state/ 缓存（可选）
      - name: Restore state cache
        uses: actions/cache@v4
        with:
          path: Tool/AICodeReview/state
          key: ai-code-review-state-${{ github.ref }}

      - name: Install dependencies
        run: npm ci
        working-directory: ./Tool/AICodeReview

      - name: Write config from secrets
        run: |
          cat > config/config.json << 'EOF'
          {
            "repo": { "path": "${REPO_PATH}" },
            "model": {
              "provider": "openai",
              "options": { 
                "apiKey": "${AI_API_KEY}", 
                "baseURL": "${AI_BASE_URL}",
                "model": "hunyuan-pro" 
              }
            },
            "notifications": {
              "lark": { 
                "enabled": true, 
                "appId": "${LARK_APP_ID}", 
                "appSecret": "${LARK_APP_SECRET}",
                "chatId": "${LARK_CHAT_ID}"
              }
            }
          }
          EOF
        working-directory: ./Tool/AICodeReview
        env:
          REPO_PATH: ${{ github.workspace }}
          AI_API_KEY: ${{ secrets.AI_API_KEY }}
          AI_BASE_URL: ${{ secrets.AI_BASE_URL }}
          LARK_APP_ID: ${{ secrets.LARK_APP_ID }}
          LARK_APP_SECRET: ${{ secrets.LARK_APP_SECRET }}
          LARK_CHAT_ID: ${{ secrets.LARK_CHAT_ID }}

      - name: Run AI Code Review (daily window)
        env:
          ONE_SHOT: "true"
          REPO_PATH: ${{ github.workspace }}
          REVIEW_MODE: "daily"
        run: node src/index.js
        working-directory: ./Tool/AICodeReview
```

> 注意：`cron` 使用 UTC 时间。若需要北京时间 18:00，请将 `cron` 调整为 `0 10 * * *`（UTC+0 的 10:00）。

## 混元（OpenAI 兼容）配置示例
你可以使用本工具的 `openai` provider 并通过 `baseURL` 对接腾讯混元的 OpenAI 兼容接口（`/v1`）：

```yaml
      - name: Write config for Hunyuan (OpenAI-compatible)
        run: |
          cat > config/config.json << 'EOF'
          {
            "repo": { "path": "${{ github.workspace }}" },
            "model": {
              "provider": "openai",
              "options": {
                "apiKey": "${{ secrets.AI_API_KEY }}",
                "baseURL": "${{ secrets.AI_BASE_URL }}",  
                "model": "${{ secrets.AI_MODEL }}"
              }
            },
            "notifications": { "wecom": { "enabled": true, "webhook": "${{ secrets.WECOM_WEBHOOK }}" } },
            "schedule": { "intervalMinutes": 0, "dailyTime": "", "cron": "" },
            "review": { "maxSnippetsPerCommit": 2, "maxLinesPerSnippet": 20 }
          }
          EOF
        working-directory: ./Tool/AICodeReview
```

Secrets 建议：
- `AI_BASE_URL`: `https://api.hunyuan.cloud.tencent.com/v1`
- `AI_API_KEY`: 混元密钥
- `AI_MODEL`: 你的可用模型ID

> 提示：使用 `openai` provider 时不需要设置 `endpoint` 或自定义认证头；SDK 会基于 `baseURL` 和 `apiKey` 自动生成请求。

## Push/PR 触发示例
为HTTP模型增加密钥关键词配置示例（通过 Secrets 引用）：

```json
{
  "model": {
    "provider": "http",
    "options": {
      "baseURL": "${{ secrets.AI_HTTP_BASE_URL }}",
      "apiKey": "${{ secrets.AI_HTTP_TOKEN }}",
      "authHeaderPrefix": "${{ secrets.AI_HTTP_AUTH_PREFIX }}"
    }
  }
}
```

在推送或 PR 时执行审核，并用提交时间作为窗口起点：

```yaml
name: AI Code Review (Push/PR)

on:
  push:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Restore state cache (optional)
        uses: actions/cache@v4
        with:
          path: Tool/AICodeReview/state
          key: ai-code-review-state-${{ github.ref }}

      - name: Install dependencies
        run: npm ci
        working-directory: ./Tool/AICodeReview

      - name: Write config from secrets
        run: |
          cat > config/config.json << 'EOF'
          {
            "repo": { "path": "${{ github.workspace }}" },
            "model": {
              "provider": "http",
              "options": {
                "baseURL": "${{ secrets.AI_HTTP_BASE_URL }}",
                "apiKey": "${{ secrets.AI_HTTP_TOKEN }}",
                "authHeaderPrefix": "${{ secrets.AI_HTTP_AUTH_PREFIX }}"
              }
            },
            "notifications": { "wecom": { "enabled": true, "webhook": "${{ secrets.WECOM_WEBHOOK }}" } },
            "schedule": { "intervalMinutes": 0, "dailyTime": "", "cron": "" },
            "review": { "maxSnippetsPerCommit": 2, "maxLinesPerSnippet": 20 }
          }
          EOF
        working-directory: ./Tool/AICodeReview

      - name: Run review for push/PR
        env:
          ONE_SHOT: "true"
          REPO_PATH: ${{ github.workspace }}
          REVIEW_SINCE: ${{ github.event_name == 'pull_request' && github.event.pull_request.updated_at || github.event.head_commit.timestamp }}
        run: node src/index.js
        working-directory: ./Tool/AICodeReview

## 混元（HTTP OpenAI Chat 兼容）配置示例
如需保留 `provider: http`，可使用 OpenAI Chat 兼容负载：

```yaml
      - name: Write config for Hunyuan via HTTP (openai_chat)
        run: |
          cat > config/config.json << 'EOF'
          {
            "repo": { "path": "${{ github.workspace }}" },
            "model": {
              "provider": "http",
              "options": {
                "endpoint": "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
                "payloadFormat": "openai_chat",
                "apiKey": "${{ secrets.AI_HTTP_TOKEN }}",
                "authHeaderPrefix": "Bearer ",
                "model": "${{ secrets.AI_MODEL }}"
              }
            },
            "notifications": { "wecom": { "enabled": true, "webhook": "${{ secrets.WECOM_WEBHOOK }}" } },
            "schedule": { "intervalMinutes": 0, "dailyTime": "", "cron": "" },
            "review": { "maxSnippetsPerCommit": 2, "maxLinesPerSnippet": 20 }
          }
          EOF
        working-directory: ./Tool/AICodeReview
```

注意事项：
- `endpoint` 必须指向 `.../v1/chat/completions`；否则会返回 404。
- 必填 `options.model`；其值应为混元可用的模型ID。
- 如认证非标准 Bearer，可改用 `options.headers` 自定义头（例如 `X-Api-Key`）。
```

## Secrets 与@作者映射
- 将敏感信息存入仓库 Secrets：如 `OPENAI_API_KEY`、`LARK_WEBHOOK`、`WECOM_WEBHOOK`、SMTP 密码等。
- `mention_map` 中将作者邮箱映射到平台用户ID：
  - 企业微信：`email_to_wecom_userid[author@example.com] = "userid"`，消息中使用 `<@userid>` 精确@。
  - 飞书：`email_to_lark_open_id[author@example.com] = "open_id"`，消息文本中会加入 `@作者名`。

## AI连接与密钥配置（GitHub Secrets）
- OpenAI（外网大模型）：
  - 在 GitHub 仓库中打开：`Settings -> Secrets and variables -> Actions -> New repository secret`
  - 添加 `OPENAI_API_KEY`（值为你的API密钥）
  - 在工作流写入配置：`model.provider: openai`，`model.options.model: gpt-4o-mini`（或你可用的模型名）
  - 示例已在上文“Write config from secrets”步骤中体现。
- Ollama（本地模型）：
  - 无需Secrets，但Runner机器需要预先安装并运行 `ollama serve`
  - 在配置中设置：`model.provider: ollama`、`options.endpoint`（如默认 `http://localhost:11434/api/generate`）与 `options.model`。
- HTTP（私有/自建服务）：
  - 新增 `AI_HTTP_BASE_URL` 为Secrets，值为你的HTTP服务地址（原生协议直接为完整端点；OpenAI Chat 兼容为 `/v1` 根路径）
  - 在配置中设置：`model.provider: http`、`options.baseURL: ${{ secrets.AI_HTTP_BASE_URL }}`
  - 可选：`AI_HTTP_TOKEN`（Masked）作为认证令牌；配置 `options.apiKey: ${{ secrets.AI_HTTP_TOKEN }}`
  - 可选：`AI_HTTP_AUTH_PREFIX` 自定义认证头前缀；配置 `options.authHeaderPrefix: ${{ secrets.AI_HTTP_AUTH_PREFIX }}`（默认 `Bearer `）
  - 如需额外自定义头，在生成 `config.json` 时写入 `options.headers`，例如：`{"X-Org": "${{ secrets.AI_HTTP_X_ORG }}"}`

> 注意：不要将密钥硬编码到仓库。统一放入 Secrets 并在工作流中引用。

## 需要提交到仓库的文件
将如下文件/目录提交到仓库，以便CI调用：
- `AICodeReview/`
  - `package.json`、`package-lock.json`（可选）
  - `README.md`、`docs/`（可选，含本指南）
  - `src/`（入口与模块代码）
  - `rules/`（你的 `.md` 规则文件，至少准备一个）
  - `config/config.example.json`（示例配置，建议提交）
  - `config/config.json`（不建议提交密钥；推荐在工作流中按Secrets动态生成）

两种配置方式：
- 推荐：在工作流步骤中“生成 config.json”，从Secrets写入（示例已提供）。
- 备选：提交一个去除敏感信息的 `config.json`，并在CI中通过环境变量覆盖关键字段（例如 `REPO_PATH`、`REVIEW_MODE/REVIEW_SINCE`），但密钥仍建议走Secrets并在工作流中注入。

## 目录结构与路径
- 本工具推荐放置在仓库根目录的 `Tool/AICodeReview/` 下。请在工作流中将 `working-directory` 与缓存路径改为 `./Tool/AICodeReview` 与 `Tool/AICodeReview/state`。
  - 如你将工具置于根目录（`./`），请相应将 `working-directory` 改为 `./` 并调整缓存路径。

## 常见问题
- 定时与时区：GitHub 的 `cron` 使用 UTC。根据你的时区调整表达式。
- 增量审核：启用 `actions/cache` 缓存 `state/` 目录；若不用缓存，每次会回退到默认窗口或 `REVIEW_MODE`/`REVIEW_SINCE`。
- 推送事件的时间窗口：可用 `github.event.head_commit.timestamp` 作为起点，或自行计算基线时间。
- 请求大小与HTTP 413：工具默认仅发送“提取的片段”而非整份 `diff`。如仍遇到 413，请降低 `review.maxSnippetsPerCommit`/`maxLinesPerSnippet`，或提升服务端限额（例如 Nginx `client_max_body_size`）。
- 文件缺失：确保 `Tool/AICodeReview/src/index.js` 与 `Tool/AICodeReview/rules/*.md` 已提交；`config/config.json` 可在工作流运行时生成。
 - 404/认证错误：
   - 使用 `openai` provider 时，确认 `baseURL` 正确（混元应为 `https://api.hunyuan.cloud.tencent.com/v1`）且 `AI_MODEL` 存在。
   - 使用 `http` provider 时，确认 `baseURL` 指向第三方 `/v1` 根路径并设置 `payloadFormat: openai_chat`；原生协议时确保 `baseURL` 为你的服务完整端点且返回 `{ review: "..." }`。