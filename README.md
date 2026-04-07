# AI Code Review CI

一个基于 Node.js 的 AI 代码评审工具。它从 Git 仓库收集增量提交，按 `rules/*.md` 规则生成审查建议，并通过飞书、企业微信或邮件发送给作者。

## 适用场景

- 在本地仓库或 CI 中定时执行代码评审
- 用 Markdown 规则文件管理团队审查标准
- 接入 OpenAI、Ollama 或兼容 HTTP 服务
- 按作者邮箱映射飞书 / 企业微信账号进行定向通知

## 核心能力

- 增量收集 Git 提交，支持 `REVIEW_MODE` / `REVIEW_SINCE`
- 片段提取与路径过滤，减少请求体体积
- 多模型 Provider：`openai`、`ollama`、`http`
- 多通知通道：飞书、企业微信、邮件
- 支持单次执行与常驻调度

## 快速开始

1. 安装依赖：`npm install`
2. 复制并修改配置：`config/config.json` 或 `.env`
3. 准备至少一条规则：`rules/*.md`
4. 运行：
   - 本地常驻：`npm run dev`
   - 单次执行：`ONE_SHOT=true node src/index.js`

## 运行要求

- Node.js 18+
- 可访问目标 Git 仓库
- 已配置 AI Provider
- 如果要发通知，至少启用一个通知通道

## 文档索引

- 通用部署与运行说明：`docs/Deployment.md`
- GitHub Actions 接入：`docs/GitHub.md`
- GitLab CI 接入：`docs/GitLab.md`
- 运维与回滚：`docs/Operations.md`
- 商用化检查清单：`docs/CommercializationChecklist.md`
- 更新记录：`CHANGELOG.md`

## 项目结构

```text
src/
  index.js
  modules/
rules/
config/
docs/
state/
```

## 开发与验证

- 启动：`npm run dev`
- 测试：`npm test`
