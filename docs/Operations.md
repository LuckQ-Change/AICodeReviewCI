# 运维与回滚

## 审计日志

- 默认写入 `state/audit.log`
- 格式为 JSON Lines，一行一个事件
- 关键事件包括：任务开始、无提交跳过、任务完成、主流程失败

## 结果文件

- `state/latest-results.json`：最近一次运行的完整快照
- `state/results.jsonl`：历史结果追加文件，适合筛选、统计和后续报表

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

## 回滚建议

1. 回退到上一个已验证版本。
2. 清理本次版本新增但不兼容的配置项。
3. 保留 `state/last_run.json`，避免重复审查历史提交。
4. 重新执行 `npm test` 后再恢复调度。
