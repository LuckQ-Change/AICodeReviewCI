# AI Code Review CI

一个基于 Node.js 的 AI 代码评审工具。它从 Git 仓库收集增量提交，按 `rules/*.md` 规则生成审查建议，并通过飞书、企业微信或邮件发送给作者。

## 适用场景

- 在本地仓库或 CI 中定时执行代码评审
- 用 Markdown 规则文件管理团队审查标准
- 接入 OpenAI、Ollama 或兼容 HTTP 服务
- 按作者邮箱映射飞书 / 企业微信账号进行定向通知

## 核心能力

- 增量收集 Git 提交，支持 `REVIEW_MODE` / `REVIEW_SINCE`
- **按当前分支抓取**：默认自动审查目标仓库当前所处分支（含远程跟踪分支），可用 `repo.branch` 覆盖
- **多语言识别**：内置宽默认扩展名（JS/TS、Java、Go、C/C++、C#、Python、Rust 等），可用 `review.codeExtensions` 覆盖
- **混合审查**：内置静态规则（高置信，仅 JS/TS）+ 条件 AI（仅 `review: ai` 的 MD 规则）
- **准确度约束**：AI issue 须含 `evidence` 且经 diff 锚定校验后方可通知；提示词采用「高精度优先」策略，宁可漏报不臆测
- **工程索引**：首次审核构建 `符号→文件` 索引（带进度输出，缓存于 `state/`），为 AI 提供跨文件线索，降低“资源未释放/变量未使用”等跨文件误判
- 工程上下文缓存（`state/repo-context-*.json`、`state/project-index-*.json`）提升 AI 语义审查质量
- 片段提取与路径过滤，减少请求体体积
- 多模型 Provider：`openai`、`ollama`、`http`
- 多通知通道：飞书、企业微信、邮件；默认仅在发现问题时通知作者
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
  index.js                 # 入口：收集 -> 审查 -> 通知 -> 落盘 -> 审计
  modules/
    config.js              # 配置加载、环境变量映射与校验
    git-collector.js       # 按当前分支增量收集提交
    rules-loader.js        # 解析 rules/*.md（builtin / ai）
    reviewer.js            # 审查主流程（静态 + AI + grounding + 合并）
    project-index.js       # 工程索引：符号→文件，跨文件线索
    context-cache.js       # 工程上下文缓存
    issue-grounding.js     # AI issue 的 diff 锚定校验
    issue-merge.js         # 静态/AI issue 合并去重
    review-since.js        # 审查起点计算（daily / since）
    scheduler.js           # 常驻调度
    metrics.js             # 运行指标汇总
    result-store.js / result-query.js  # 结果落盘与查询
    state-store.js         # last_run / processedHashes
    audit-log.js / retry.js / errors.js
    static/                # 内置静态规则（diff 解析、JS/TS 检查）
    ai/                    # prompt、输出解析、provider（openai/ollama/http）
    notifiers/             # 飞书 / 企业微信 / 邮件
    utils/                 # 片段提取、路径过滤、片段格式化
scripts/query-results.js   # 结果查询 CLI（npm run results:query）
rules/                     # Markdown 规则（review: builtin | ai）
config/config.json
docs/
state/                     # 缓存、结果、审计、索引
test/run-tests.js
```

## 开发与验证

- 启动：`npm run dev`
- 测试：`npm test`
