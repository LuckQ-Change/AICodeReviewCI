---
review: builtin
checks:
  - null-safety
  - resource-cleanup
  - secrets-in-logs
---
# 错误处理与日志（内置静态检查）

以下条目由内置静态规则在 diff 新增行上检测（高置信）：

- 敏感信息：禁止在日志中输出凭证、密钥、token 等（`secrets-in-logs`）
- 空 catch 块、未保护的 JSON.parse、Promise 缺少 .catch（`null-safety`）
- useEffect 内定时器无 cleanup、addEventListener 无 remove（`resource-cleanup`）
