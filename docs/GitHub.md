# GitHub Actions 部署指南

本文说明如何在 GitHub Actions 中以单次任务方式运行 AI Code Review CI。推荐做法是由 GitHub 负责触发，工具本身只执行一次。

## 部署原则

- 在 CI 中始终设置 `ONE_SHOT=true`
- 将 `REPO_PATH` 指向 `${{ github.workspace }}`
- 将密钥、Webhook、SMTP 密码等全部放入 GitHub Secrets
- 如需增量审查，可缓存 `state/` 目录

## 推荐目录

如果工具存放在业务仓库的 `Tool/AICodeReview/` 下，后续工作流中的 `working-directory` 统一使用该路径。

## 必备 Secrets

- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`
- `LARK_WEBHOOK` 或 `WECOM_WEBHOOK`
- 如启用邮件，还需要 `EMAIL_SMTP_HOST`、`EMAIL_SMTP_PORT`、`EMAIL_FROM`、`EMAIL_SMTP_USER`、`EMAIL_SMTP_PASS`

## 示例工作流

创建 `.github/workflows/ai-code-review.yml`：

```yaml
name: AI Code Review

on:
  schedule:
    - cron: "0 10 * * *"
  workflow_dispatch:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Restore state cache
        uses: actions/cache@v4
        with:
          path: Tool/AICodeReview/state
          key: ai-code-review-state-${{ github.ref }}

      - name: Install deps
        run: npm ci
        working-directory: ./Tool/AICodeReview

      - name: Run review
        working-directory: ./Tool/AICodeReview
        env:
          ONE_SHOT: "true"
          REPO_PATH: ${{ github.workspace }}
          REVIEW_MODE: "daily"
          AI_PROVIDER: "openai"
          AI_API_KEY: ${{ secrets.AI_API_KEY }}
          AI_MODEL: ${{ secrets.AI_MODEL }}
          AI_BASE_URL: ${{ secrets.AI_BASE_URL }}
          LARK_ENABLED: "true"
          LARK_WEBHOOK: ${{ secrets.LARK_WEBHOOK }}
        run: node src/index.js
```

## 触发策略建议

- 每日定时审查：使用 `REVIEW_MODE=daily`
- 按时间窗口补审：使用 `REVIEW_SINCE`
- Pull Request / Push 审查：由工作流事件计算 `REVIEW_SINCE`

## 常见问题

### 时区

GitHub Actions 的 `cron` 使用 UTC。北京时间 18:00 需要写成 `0 10 * * *`。

### 没有找到配置或规则

通常是 `working-directory` 配错了。确认工作目录指向工具根目录，而不是业务仓库根目录。

### 没有新提交

检查：

- `REVIEW_MODE` / `REVIEW_SINCE` 是否合理
- 是否启用了 `state/` 缓存
- 是否使用了 `fetch-depth: 0`

### 413 Payload Too Large

降低：

- `review.maxSnippetsPerCommit`
- `review.maxLinesPerSnippet`
