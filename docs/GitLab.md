# GitLab CI 部署指南

本文说明如何在 GitLab CI 中以单次任务方式运行 AI Code Review CI。推荐使用 GitLab Schedule 触发，工具内部不再开启常驻调度。

## 部署原则

- 在 CI 中始终设置 `ONE_SHOT=true`
- 将 `REPO_PATH` 指向 `$CI_PROJECT_DIR`
- 所有密钥统一放到 GitLab CI Variables
- 如需增量审查，缓存 `state/` 目录

## 必备 Variables

- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`
- `LARK_WEBHOOK` 或 `WECOM_WEBHOOK`
- 如启用邮件，还需要 SMTP 相关变量

## 示例 `.gitlab-ci.yml`

```yaml
stages:
  - review

ai_code_review:
  stage: review
  image: node:18
  cache:
    key: ai-code-review-state-${CI_COMMIT_REF_SLUG}
    paths:
      - Tool/AICodeReview/state/
  script:
    - cd Tool/AICodeReview
    - npm ci
    - node src/index.js
  variables:
    ONE_SHOT: "true"
    REPO_PATH: "$CI_PROJECT_DIR"
    REVIEW_MODE: "daily"
    AI_PROVIDER: "openai"
    AI_API_KEY: "$AI_API_KEY"
    AI_MODEL: "$AI_MODEL"
    AI_BASE_URL: "$AI_BASE_URL"
    WECOM_ENABLED: "true"
    WECOM_WEBHOOK: "$WECOM_WEBHOOK"
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_PIPELINE_SOURCE == "web"
```

## 调度建议

- 每日审查：在 `CI/CD -> Schedules` 中配置计划任务，结合 `REVIEW_MODE=daily`
- 手动补审：在 Web 触发时附带 `REVIEW_SINCE`
- Push 审查：新增单独 job，用 `rules: if $CI_PIPELINE_SOURCE == "push"`

## 常见问题

### CI Variables 没生效

检查：

- 变量是否启用了对应环境
- 是否为 Masked / Protected 导致分支不可见
- 日志中是否出现 `[config] 识别到环境变量`

### 没有规则文件

确认 `rules/*.md` 已提交到仓库，且运行目录正确。

### 增量审查重复

先确认 `state/` 目录是否被 GitLab cache 保存并恢复。
