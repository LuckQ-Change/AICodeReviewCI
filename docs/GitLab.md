# GitLab CI 接入指南

本指南演示如何在 GitLab CI 中接入 AI Code Review 工具，实现计划任务（每日定时）或基于 push 的单次审核，并通过企业微信/飞书/邮件通知作者。

## 关键设计
- 单次运行：设置 `ONE_SHOT=true`，工具只执行一次，跳过内部 `node-cron` 定时器（CI中建议用平台定时）。
- 时间窗口：
  - 每日：设置 `REVIEW_MODE=daily`，审核“当天 00:00 到当前定时点”的提交。
  - 自定义：设置 `REVIEW_SINCE`（毫秒或 ISO）用于自定义起点。
- 仓库路径：设置 `REPO_PATH="$CI_PROJECT_DIR"`。
- 状态缓存：使用 GitLab `cache` 机制缓存 `state/` 目录，实现增量审核（可选）。

## .gitlab-ci.yml 示例（每日 18:00 定时 + 企业微信通知）
在仓库根目录创建 `.gitlab-ci.yml`：

```yaml
stages: [review]

ai_code_review:
  stage: review
  image: node:18
  cache:
    key: "ai-code-review-state-${CI_COMMIT_REF_NAME}"
    paths:
      - Tool/AICodeReview/state/
  script:
    - cd Tool/AICodeReview
    - npm ci
    - >
      cat > config/config.json << 'EOF'
      {
        "repo": { "path": "$CI_PROJECT_DIR" },
        "model": { "provider": "http", "options": { "baseURL": "$AI_HTTP_BASE_URL" } },
        "notifications": {
          "wecom": { "enabled": true, "webhook": "$WECOM_WEBHOOK" },
          "lark": { "enabled": false, "webhook": "" },
          "email": { "enabled": false, "smtp": { "host": "", "port": 465, "secure": true, "user": "", "pass": "" }, "from": "AI Code Review <noreply@example.com>" }
        },
        "mention_map": { "email_to_wecom_userid": { "dev1@example.com": "zhangsan" } },
        "schedule": { "intervalMinutes": 0, "dailyTime": "", "cron": "" },
        "review": { "maxSnippetsPerCommit": 2, "maxLinesPerSnippet": 20 }
      }
      EOF
    - ONE_SHOT=true REPO_PATH="$CI_PROJECT_DIR" REVIEW_MODE=daily node src/index.js
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_PIPELINE_SOURCE == "pipeline"   # 允许手动触发
```

> 在 GitLab 的 `CI/CD -> Schedules` 中添加计划任务（例如每天18:00触发）。

## Push 触发示例
在每次推送时运行审核，并用当前时间作为窗口起点（可根据需要修改）：

```yaml
stages: [review]

ai_code_review_push:
  stage: review
  image: node:18
  script:
    - cd Tool/AICodeReview
    - npm ci
    - >
      cat > config/config.json << 'EOF'
      { "repo": { "path": "$CI_PROJECT_DIR" }, "model": { "provider": "openai", "options": { "apiKey": "$OPENAI_API_KEY", "model": "gpt-4o-mini" } }, "notifications": { "lark": { "enabled": true, "webhook": "$LARK_WEBHOOK" } }, "schedule": { "intervalMinutes": 0, "dailyTime": "", "cron": "" }, "review": { "maxSnippetsPerCommit": 2, "maxLinesPerSnippet": 20 } }
      EOF
    - ONE_SHOT=true REPO_PATH="$CI_PROJECT_DIR" REVIEW_SINCE="$(date -Iseconds)" node src/index.js
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
```

## Secrets 与@作者映射
- 将敏感信息存入 GitLab 的 CI 变量：如 `OPENAI_API_KEY`、`WECOM_WEBHOOK`、`LARK_WEBHOOK`、`AI_HTTP_BASE_URL`、SMTP 密码等。
- `mention_map`：
  - 企业微信：配置 `email_to_wecom_userid`，消息中用 `<@userid>` 精确@作者。
  - 飞书：配置 `email_to_lark_open_id`，消息文本中加入 `@作者名`。

## AI连接与密钥配置（GitLab CI 变量）
- OpenAI（外网大模型）：
  - 在项目 `Settings -> CI/CD -> Variables` 添加变量 `OPENAI_API_KEY`（Masked）
  - 在 `.gitlab-ci.yml` 生成 `config.json` 时引用：
    - `model.provider: openai`
    - `model.options.apiKey: $OPENAI_API_KEY`
    - `model.options.model: gpt-4o-mini`（或你的模型名）
- Ollama（本地模型）：
  - Runner机器需预先运行 `ollama serve`；一般不需要CI变量。
  - 在配置中设置 `model.provider: ollama`、`options.endpoint` 与 `options.model`。
- HTTP（私有/自建服务）：
  - 添加变量 `AI_HTTP_BASE_URL`（Masked），值为服务根地址。
  - 可选：添加变量 `AI_HTTP_TOKEN`（Masked）作为认证令牌；配置 `options.apiKey: $AI_HTTP_TOKEN`
  - 可选：添加变量 `AI_HTTP_AUTH_PREFIX`（默认为 `Bearer `）用于自定义认证头前缀；配置 `options.authHeaderPrefix: $AI_HTTP_AUTH_PREFIX`
  - 在配置中设置 `model.provider: http`、`options.baseURL: $AI_HTTP_BASE_URL`。

示例（在流水线生成的 `config.json` 中写入 HTTP 认证选项）：

```json
{
  "model": {
    "provider": "http",
    "options": {
      "baseURL": "$AI_HTTP_BASE_URL",
      "apiKey": "$AI_HTTP_TOKEN",
      "authHeaderPrefix": "$AI_HTTP_AUTH_PREFIX"
    }
  }
}
```

> 建议：不要将密钥直接提交到仓库。统一放入 CI Variables 并在流水线中引用生成配置。

## 需要提交到仓库的文件
将如下文件/目录提交到仓库，以便CI在流水线中调用：
- `AICodeReview/`
  - `package.json`、`package-lock.json`（可选）
  - `README.md`、`docs/`（可选，含本指南）
  - `src/`（入口与模块代码）
  - `rules/`（你的 `.md` 规则文件，至少准备一个）
  - `config/config.example.json`（示例配置，建议提交）
  - `config/config.json`（不建议提交密钥；推荐在流水线中按变量动态生成）

两种配置方式：
- 推荐：在 `.gitlab-ci.yml` 中“生成 config.json”，用 CI 变量写入敏感数据（示例已提供）。
- 备选：提交一个去除敏感信息的 `config.json`，在CI中通过环境变量覆盖关键字段（例如 `REPO_PATH`、`REVIEW_MODE/REVIEW_SINCE`），但密钥仍建议通过 CI 变量在流水线时注入。

## 目录结构与路径
- 推荐将工具放在仓库根目录的 `Tool/AICodeReview/` 下。请在 `.gitlab-ci.yml` 中把 `cd` 与缓存路径改为 `Tool/AICodeReview` 与 `Tool/AICodeReview/state/`。
  - 若你将工具置于根目录（`./`），请将 `cd Tool/AICodeReview` 改为 `cd ./` 并调整缓存路径。

## 常见问题
- 定时与时区：GitLab 计划任务使用你项目的时区配置；请在 `Settings -> General -> Localization` 中确认时区。
- 增量审核：启用 `cache` 保存 `state/` 目录。若不使用缓存，每次会依赖 `REVIEW_MODE` 或 `REVIEW_SINCE` 控制范围。
- 自定义窗口：对于 PR/MR 审核，可在运行前计算基线时间并传入 `REVIEW_SINCE`。
- 请求大小与HTTP 413：工具默认仅发送“提取的片段”而非整份 `diff`。如仍遇到 413，请降低 `review.maxSnippetsPerCommit`/`maxLinesPerSnippet`，或提升服务端限额（例如 Nginx `client_max_body_size`）。
- 文件缺失：确保 `Tool/AICodeReview/src/index.js` 与 `Tool/AICodeReview/rules/*.md` 已提交；`config/config.json` 可在流水线运行时生成。