# 运维与回滚

## 审计日志

- 默认写入 `state/audit.log`
- 格式为 JSON Lines，一行一个事件
- 关键事件包括：任务开始、无提交跳过、任务完成、主流程失败

## 结果文件

- `state/latest-results.json`：最近一次运行的完整快照
- `state/results.jsonl`：历史结果追加文件，适合筛选、统计和后续报表

## 状态与缓存文件

- `state/last_run.json`：上次运行时间与 `processedHashes`（增量去重）
- `state/repo-context-*.json`：工程上下文缓存（按 `package.json` 签名失效）
- `state/project-index-*.json`：工程索引缓存（按源文件集合签名失效，新增/删除文件时重建）

> 首次审核会构建工程索引并打印进度日志，耗时随仓库规模增加；缓存 `state/` 目录可避免每次重建。

## 本地查询

按严重级别筛选：

```powershell
npm run results:query -- --severity high
```

按作者筛选：

```powershell
npm run results:query -- --author alice
```

按文件或提交筛选：

```powershell
npm run results:query -- --file src/index.js --limit 10
npm run results:query -- --commit abc123
```

自定义结果目录：

```powershell
npm run results:query -- --results-dir state
```

## 线上检查项

- `npm test` 必须通过
- AI Provider 凭证必须有效
- 至少一个通知通道可用
- `rules/*.md` 目录存在且有内容
- `state/` 目录可写

## 常见故障

### 模型输出不是 JSON

- 现象：结果进入 fallback 模式
- 处理：检查 provider 是否支持 `json_object`，必要时收紧代理层返回格式

### 重复审查

- 先检查 `state/last_run.json` 中的 `processedHashes`
- 再检查外部调度是否与内部 cron 同时开启

### 通知未送达

- 检查飞书 / 企业微信 webhook 或 App 配置
- 检查邮件 SMTP 联通性和认证
- 查看 `state/audit.log` 与控制台错误日志

### 提交有代码却提示“未识别到代码片段”

- 多为目标语言扩展名不在白名单：用 `review.codeExtensions` 增补（默认已覆盖常见语言）
- 确认 `review.include` / `review.exclude` 未把变更文件过滤掉

### AI 误判偏多（如资源未释放/变量未使用）

- 确认 `review.context.index.enabled` 为 `true`，且日志中出现工程索引构建/命中
- 检查相关释放/清理函数是否被索引（仅函数/方法/类型等定义会进索引，局部变量不进）
- 必要时通过 `review.context.index.exclude` 收敛索引范围，或调大 `maxFiles`

## 回滚建议

1. 回退到上一个已验证版本。
2. 清理本次版本新增但不兼容的配置项。
3. 保留 `state/last_run.json`，避免重复审查历史提交。
4. 重新执行 `npm test` 后再恢复调度。
