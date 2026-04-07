# AI Code Review CI

一个可本地部署或接入外网大模型的AI代码审核工具。以`.md`规则文件驱动，支持飞书、企业微信、邮件通知，并具备定时功能（每隔多久/每日指定时间）。无需生成审核文档，直接以文本消息通知第三方机器人，消息中会@作者并附带部分代码片段与优化建议。

## 功能概览
- 支持AI模型接入：OpenAI、Ollama（本地）、通用HTTP接口
- 审核规则：在`rules/`目录下使用`.md`文件定义
- 通知渠道：飞书机器人、企业微信机器人、邮件（文本方式）
- 定时任务：按间隔或每天指定时间运行，审核到该时间点当天所有提交
- 审核结果：@作者，并附带代码片段与优化方案

## 快速开始
1. 安装依赖：`npm install`
2. 复制配置：将`config/config.example.json`复制为`config/config.json`并填写。
3. 运行开发模式：`npm run dev`
4. 路径放置建议：将本项目置于业务仓库根目录的 `Tool/AICodeReview/` 下；如采用CI接入，请在工作流/流水线中把 `working-directory` 或 `cd` 指向 `Tool/AICodeReview`，并将缓存路径改为 `Tool/AICodeReview/state`。

## 运行与环境变量
- `ONE_SHOT`: 设为`true`时仅执行一次，跳过内部定时器（CI中推荐）。
- `CI`: 设为`true`时等效于单次运行。
- `REPO_PATH`: 覆盖仓库路径，指向待审核的Git仓库绝对路径（如 `C:/Repos/MyProject`）。
- `REVIEW_MODE`: `daily` 时在定时触发场景审核“当天 00:00 到当前定时点”的提交。
- `REVIEW_SINCE`: 指定审核起点（毫秒时间戳或ISO时间）。若与 `REVIEW_MODE` 同时设置，以 `REVIEW_SINCE` 为准。

示例（本地单次运行）：
- macOS/Linux：
  - `ONE_SHOT=true REPO_PATH="/path/to/repo" node src/index.js`
- Windows PowerShell：
  - `$env:ONE_SHOT="true"; $env:REPO_PATH="C:\\path\\to\\repo"; node src/index.js`
- Windows（规避PowerShell策略执行限制时）：
  - `cmd /c node src/index.js`

每日定时窗口模拟（本地）：
- `ONE_SHOT=true REVIEW_MODE=daily REPO_PATH="/path/to/repo" node src/index.js`

## 本地测试流程
- 在 `config/config.json` 写入你的仓库路径与模型接入（OpenAI/Ollama/HTTP）。
- 在 `rules/` 中添加若干 `.md` 规则文件（命名规范、错误处理、日志安全等）。
- 运行：
  - `npm run dev`（常驻执行，含内部定时器）或
  - `ONE_SHOT=true REPO_PATH="..." node src/index.js`（单次执行，类似CI行为）。

## 通知配置速查
- 飞书：开启 `notifications.lark.enabled`。
  - **Webhook 模式**：填写 `webhook`（及可选 `secret` 签名）；
  - **App 模式**：填写 `appId`、`appSecret` 及 `chatId`（发送至群）或 `openId`（发送至用户）；
  - 如配置 `mention_map.email_to_lark_open_id`，消息会以 `<at user_id="...">` 方式精确 @作者。
- 企业微信：开启 `notifications.wecom.enabled` 并填写 `webhook`；在 `mention_map.email_to_wecom_userid` 配置邮箱到 `userid`，消息中使用 `<@userid>` 精确@作者。
- 邮件：开启 `notifications.email.enabled` 并设置 `smtp` 与 `from`，收件人自动取作者邮箱。
- 报告样式：通过 `notifications.reportStyle` 控制输出内容：
  - `full`（默认）：包含提交信息、片段与审查建议。
  - `snippets_only`：仅输出片段纯文本（不含提交信息/建议）。
  - `issues_only`：仅输出审查建议（不含提交信息/片段）。
  - `issues_with_snippets`：只输出审查建议与片段（不含提交信息）。
  - 默认保护：当未提取到片段且用于审查的diff为空时，将自动跳过发送通知，避免“空话模板”。
  - 发送开关：`notifications.skipWhenNoSnippets`（默认 `true`）。当未提取到任何片段时，直接不发送通知；如需在无片段时仍发送“仅问题”类消息，将此项设为 `false`。

## 无代码变更的处理
- 识别规则：当一次提交在路径过滤后未产生可审的 `@@` hunk（即未提取到任何片段），审查层会跳过模型调用（不走AI流程）。
- 通知行为：与上述一致，默认不发送任何消息（受 `notifications.skipWhenNoSnippets` 控制，默认启用）。
- 建议配置：通过 `review.include`/`review.exclude` 精确限定审核范围，例如只审 `scr/**/*.cs`，避免“非代码变更”触发审查。
 - 片段格式：通过 `notifications.snippetFormat` 精简片段内容，支持：
   - `raw`（默认）：保留原始diff片段
   - `no_headers`：去除 `diff --git`、`@@`、`---`、`+++` 等头部行
   - `added_only`：仅保留以 `+` 开头的新增行

> 注：当前版本已禁用在通知消息中显示差异片段。含片段的样式（如 `snippets_only`、`issues_with_snippets`）将不再展示片段内容，消息仅包含审查建议或相应提示。

## 消息格式示例
```
AI代码审核结果
仓库提交: <commit-hash>
作者: 张三 <zhangsan@example.com>
时间: 2025-01-01T10:00:00Z
说明: 修复登录重试逻辑

片段1:
@@ -10,6 +10,12 @@
+ if (retryCount > 3) {
+   logger.warn('Too many retries')
+ }

审查建议:
- 问题：缺少对网络错误的分类处理；warn日志过于宽泛。
- 建议：区分超时/认证/断网的异常分支；使用结构化日志，避免泄露敏感信息。
```

## 常见问题（Windows）
- PowerShell策略导致 `npm` 或脚本不可执行：
  - 解决：使用 `cmd /c npm install` 或 `cmd /c node src/index.js`。
- 路径分隔符：在配置中使用Windows绝对路径需转义（如 `C:\\Repos\\MyProject`）。


## 配置说明
参考 `config/config.example.json`，项目支持 **配置文件** 与 **环境变量** 混合配置，优先级：环境变量 > 配置文件。

### 核心配置项
- `repo.path`: 需要被审核的Git仓库路径（环境变量：`REPO_PATH`）
- `model.provider`: `openai` | `ollama` | `http`（环境变量：`AI_PROVIDER`）
- `model.options`: 
  - `apiKey`: API密钥（环境变量：`AI_API_KEY`）
  - `baseURL`: 服务端点（环境变量：`AI_BASE_URL`）
  - `model`: 模型名称（环境变量：`AI_MODEL`）
- `notifications.lark`: 
  - `enabled`: 是否启用（环境变量：`LARK_ENABLED`）
  - `appId`: 飞书应用ID（环境变量：`LARK_APP_ID`）
  - `appSecret`: 飞书应用密钥（环境变量：`LARK_APP_SECRET`）
  - `chatId`: 目标群聊ID（环境变量：`LARK_CHAT_ID`）
- `notifications.email`: 
  - `enabled`: 是否启用（环境变量：`EMAIL_ENABLED`）
  - `from`: 发件人地址（环境变量：`EMAIL_FROM`）
  - `smtp.host`: SMTP服务器（环境变量：`EMAIL_SMTP_HOST`）
  - `smtp.port`: 端口（环境变量：`EMAIL_SMTP_PORT`）
  - `smtp.user`: 用户名（环境变量：`EMAIL_SMTP_USER`）
  - `smtp.pass`: 密码（环境变量：`EMAIL_SMTP_PASS`）

### 如何设置环境变量
你可以根据操作系统选择以下方式设置环境变量，或者使用 **`.env` 文件**（推荐）。

#### 方式 A：使用 `.env` 文件 (最推荐，本地持久化)
1. 在项目根目录创建 `.env` 文件（可参考 `.env.example`）。
2. 将配置项写入文件：
   ```env
   AI_API_KEY="sk-xxxx"
   LARK_APP_ID="cli_xxxx"
   LARK_APP_SECRET="xxxx"
   ```
3. 直接运行 `node src/index.js`，程序会自动加载。

#### 方式 B：Windows (PowerShell)
```powershell
# 注意：必须在同一个窗口运行！
$env:AI_API_KEY="sk-xxxx"
$env:LARK_APP_ID="cli_xxxx"
$env:LARK_APP_SECRET="xxxx"
node src/index.js
```

#### 方式 C：Linux / macOS (Bash/Zsh)
```bash
export AI_API_KEY="sk-xxxx"
export LARK_APP_ID="cli_xxxx"
export LARK_APP_SECRET="xxxx"
node src/index.js
```

### 常见问题排查
1. **未识别到变量**：程序启动时会打印 `[config] 识别到环境变量: XXX` 或 `[config] 已从 .env 文件加载环境变量`。如果没有看到此日志，说明变量未注入成功。
2. **终端会话问题**：环境变量仅在当前窗口有效。如果你在 PowerShell 设置了变量，但在 IDE 的内置终端运行，是读取不到的。
3. **配置文件路径**：确保 `.env` 文件放在项目根目录下（与 `package.json` 同级）。
4. **占位符未替换**：如果看到 `[config] 环境变量 ${XXX} 未定义` 的警告，请检查变量名是否拼写正确（注意大小写）。
在 `config.json` 中，你可以使用 `${VAR_NAME}` 语法引用环境变量。例如：
```json
{
  "model": {
    "options": {
      "apiKey": "${AI_API_KEY}"
    }
  }
}
```

## 部署说明
### 方案一：CI/CD 自动化部署 (推荐)
1. 在 GitHub/GitLab 的 Secrets 中配置上述环境变量。
2. 参考 [GitHub Actions 指南](docs/GitHub.md) 或 [GitLab CI 指南](docs/GitLab.md) 编写工作流。
3. 利用 `ONE_SHOT=true` 模式实现触发式或定时审核。

### 方案二：本地常驻运行
1. `npm install` 安装环境。
2. 复制 `config.example.json` 为 `config.json` 并填写必要信息。
3. 执行 `npm start`，工具将根据 `schedule` 配置的频率循环执行。

## 更新日志
详见 [CHANGELOG.md](CHANGELOG.md)。

### 请求大小控制（避免HTTP 413）
- 工具已默认仅向模型发送“提取的片段（snippets）”，而非整份`diff`，以降低请求体大小。
- 可通过 `review.maxSnippetsPerCommit` 与 `review.maxLinesPerSnippet` 进一步控制上下文大小。
- 建议默认：
  - `review.maxSnippetsPerCommit: 2`
  - `review.maxLinesPerSnippet: 20`
- 若仍遇到 `HTTP 413 Payload Too Large`：
  - 适当降低上述两个参数；或
  - 提升服务端限制（如 Nginx `client_max_body_size`）；或
  - 在CI中缩短审核窗口（使用 `REVIEW_MODE=daily` 或设置更近的 `REVIEW_SINCE`）。

### CI 工作流注意事项
- 请在运行步骤中将 `working-directory` 指向工具目录（推荐 `./Tool/AICodeReview`）。
- 未设置 `working-directory` 时，程序会在仓库根查找 `config/config.json` 与 `rules/`，可能导致“配置文件缺失/规则目录不存在”。
- `REVIEW_SINCE` 支持毫秒时间戳或ISO字符串（含时区，如 `+08:00`），内部会统一转换为UTC再传给 `git --since`。

## 规则编写
在`rules/`目录内添加`.md`文件，每个文件一条或多条规则，建议结构：

```md
# 命名规范
- 函数名应为动词短语，避免缩写
- 变量名清晰表达含义

# 错误处理
- API调用需要处理失败情况
- 日志内容避免泄露敏感信息
```

审核时，这些规则文本将作为提示注入AI模型。

### 规则目录示例与引用
- 建议至少包含：
  - `rules/naming-conventions.md`：命名规范（函数、变量、常量、文件/目录等）
  - `rules/error-handling.md`：错误处理与日志规范（分类处理、重试与超时、结构化日志、降级）
- 在项目的 `README.md` 中说明这些规则文件的用途与维护方式，便于团队成员查阅与更新。

### 审核运行提示
- 确保 `rules/` 目录存在且至少包含一份规则 `.md` 文件，否则无法验证代码是否符合既定标准。
- 可按模块拆分更多规则文件（如 `performance.md`、`security.md`），工具会自动加载全部 `.md` 规则。

## 通知与@作者
- 飞书：支持两种模式：
  - **群机器人模式**：开启 `notifications.lark.enabled` 并填写 `webhook`（可选 `secret` 签名）。
  - **应用机器人模式**：填写 `appId`、`appSecret` 以及 `chatId`（群 ID）或 `openId`（用户 ID）。
  - @作者：配置 `mention_map.email_to_lark_open_id` 后，消息会以 `<at user_id="...">` 方式精确 @作者。
- 企业微信：通过群机器人`webhook`发送`markdown`消息；@作者需在内容中加入`<@userid>`，请配置`mention_map.email_to_wecom_userid`
- 邮件：通过SMTP直接发送文本到作者邮箱

## 定时策略
- `intervalMinutes`: 每隔N分钟运行一次
- `dailyTime`: 每日固定时间（`HH:mm`）运行，审核当天到该时间点所有提交
- `cron`: 自定义cron表达式（可与以上互斥）

## 运行状态
工具会在`state/last_run.json`记录上次运行时间，以便增量审核。

## 安全与限制
- 不会生成审查文档，仅以文本消息发送结果
- 请确保在企业IM中机器人具有发言权限，且用户ID映射正确

## AI部署规则
 - 模型提供方选择：
  - `openai`：外网大模型；在 `config.model.options` 配置 `apiKey` 与 `model`。若对接兼容 OpenAI 的第三方（如腾讯混元），可增加 `baseURL` 指向其 `/v1` 根路径。
    - 官方 OpenAI 示例：`{"provider":"openai","options":{"apiKey":"$OPENAI_API_KEY","model":"gpt-4o-mini"}}`
    - 混元（OpenAI 兼容）示例：`{"provider":"openai","options":{"apiKey":"$AI_API_KEY","baseURL":"https://api.hunyuan.cloud.tencent.com/v1","model":"$AI_MODEL"}}`
  - `ollama`：本地部署模型，启动 `ollama serve` 并确保接口可用（默认 `http://localhost:11434/api/generate`）；在 `config.model.options` 配置 `endpoint` 与 `model`。
    - 示例：
      - 安装并启动：`ollama serve`
      - 拉取模型：`ollama pull qwen2.5-coder:latest`
      - 配置：`{"provider":"ollama","options":{"endpoint":"http://localhost:11434/api/generate","model":"qwen2.5-coder:latest"}}`
  - `http`：自定义HTTP服务，支持两种协议：
    - 原生协议：POST 到 `baseURL`（即你的服务完整端点），请求体 `{ rules, diff, context }`，返回 `{ review: "文本" }`。
    - OpenAI Chat 兼容协议：`payloadFormat: "openai_chat"`，`baseURL` 指向第三方 `/v1` 根路径（如混元），工具会自动请求 `baseURL + "/chat/completions"`；需提供 `options.model`。认证头可用 `apiKey + authHeaderPrefix` 或自定义 `headers`。
    - Secrets配置建议：在CI平台配置 `AI_HTTP_BASE_URL`、`AI_HTTP_TOKEN`（Masked，可选）与 `AI_HTTP_AUTH_PREFIX`（可选，默认 `Bearer `）。
      - 原生协议示例：`{"provider":"http","options":{"baseURL":"$AI_HTTP_BASE_URL","apiKey":"$AI_HTTP_TOKEN","authHeaderPrefix":"$AI_HTTP_AUTH_PREFIX"}}`
      - OpenAI Chat 示例（混元）：`{"provider":"http","options":{"baseURL":"https://api.hunyuan.cloud.tencent.com/v1","payloadFormat":"openai_chat","apiKey":"$AI_HTTP_TOKEN","authHeaderPrefix":"Bearer ","model":"$AI_MODEL"}}`
    - 如需额外自定义头，在 `model.options.headers` 中增加：例如 `{ "X-Org": "$AI_HTTP_X_ORG" }`

- 配置与环境变量：
  - 必填：`config.repo.path` 指向需要审核的Git仓库（绝对路径）。
  - 模型：`config.model.provider` 以及 `config.model.options`（不同provider的参数不同）。
  - 通知：在 `config.notifications` 中启用并填写 `webhook`/SMTP 信息。
  - @作者映射：在 `config.mention_map` 中配置邮箱到平台用户ID的映射（企业微信 `userid`、飞书 `open_id`）。
  - CI覆盖：
    - `ONE_SHOT=true` 或 `CI=true`：在CI中以单次模式运行（跳过内部定时器）。
    - `REPO_PATH`：覆盖仓库路径（例如 `github.workspace` 或 `CI_PROJECT_DIR`）。
    - `REVIEW_MODE=daily`：每日定时场景自动审核“当天到定时点”的提交。
    - `REVIEW_SINCE`：手动指定审核起点（毫秒时间戳或ISO字符串）。

- 安全与合规：
  - 将API密钥、机器人Webhook、SMTP密码等置于CI的Secrets/变量中，不要提交到仓库。
  - 审核内容可能包含代码片段，请确保符合公司数据安全与隐私政策（尤其是外网模型）。
  - webhook 与邮件服务需要具备访问权限与正确的网络配置（代理、防火墙）。

- 性能与成本：
  - 外网模型存在速率限制与费用，请合理设置定时频率与触发范围（`REVIEW_MODE`/`REVIEW_SINCE`）。
  - 本地模型（Ollama）需足够的CPU/GPU与内存资源，建议在专用Runner或服务器部署。
  - 减少提示大小：通过 `review.maxSnippetsPerCommit` 与 `review.maxLinesPerSnippet` 控制片段数量与长度（工具已默认仅发送片段，不传整份diff）。

- 失败与降级：
  - 模型不可达或请求失败时，日志会打印错误；可在CI平台上查看构建日志进行排查。
  - 若某provider不稳定，可在 `config.model` 中切换到备选provider（例如从`http`切换为`ollama`或`openai`）。

- 时区与定时：
  - 在GitHub Actions中，`cron` 采用UTC；GitLab Scheduled Pipelines采用项目时区。请根据所在时区设置。
  - CI定时建议采用平台级触发，工具内部定时在CI中建议关闭（通过 `ONE_SHOT=true`）。

## 开发与调试
- `src/index.js`为入口；其他模块按目录划分。
- 若你使用本地Ollama，请保证`ollama serve`已运行。

## CI接入文档
- GitHub Actions 接入指南：`docs/GitHub.md`（示例已按 `Tool/AICodeReview/` 路径配置）
- GitLab CI 接入指南：`docs/GitLab.md`（示例已按 `Tool/AICodeReview/` 路径配置）
- 文件过滤与审核路径
  - 通过 `review.include` 指定需审核的文件路径模式（glob：支持 `**`, `*`, `?`）。
  - 通过 `review.exclude` 排除不需审核的文件（如 `**/*.md`, `src/vendor/**`）。
  - 示例：
    - 包含：`"src/**/*.{js,ts}"`, `"lib/**/*.js"`
    - 排除：`"src/vendor/**"`, `"**/*.md"`
  - 说明：过滤在“提交差异解析阶段”生效，仅保留匹配文件对应的 `diff --git ...` 块；后续片段提取与提示均基于过滤后的差异。
