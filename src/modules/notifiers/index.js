import { sendToLark } from './lark.js';
import { sendToWeCom } from './wecom.js';
import { sendEmail } from './email.js';

function buildMessage(result, config) {
  const c = result.commit;
  const style = config.notifications?.reportStyle || 'full';
  // 已禁用差异片段显示：不再在消息中拼接任何diff片段

  // 仅片段：已禁用片段显示，统一返回提示或空问题文本
  if (style === 'snippets_only') {
    return '（已禁用差异片段显示）';
  }

  // 仅问题：只显示审查建议，不含提交信息与片段
  if (style === 'issues_only') {
    const issues = (result.reviewText || '').trim();
    return issues || '（未检出问题）';
  }

  // 问题 + 片段：不显示提交信息，仅展示问题与片段
  if (style === 'issues_with_snippets') {
    const issues = (result.reviewText || '').trim();
    // 片段显示已禁用，等同于仅问题
    return issues || '（未检出问题）';
  }

  // 完整：包含提交信息、片段与建议
  const header = `AI代码审核结果\n仓库提交: ${c.hash}\n作者: ${c.authorName} <${c.authorEmail}>\n时间: ${c.date}\n说明: ${c.message}`;
  const body = `${header}\n\n审查建议:\n${result.reviewText}`;
  return body;
}

export async function notifyResults({ config, results }) {
  for (const r of results) {
    // 识别审查层跳过标记：不发送通知
    if (r.skipped) {
      console.log('[notifiers] 跳过发送：审查层标记为未识别代码片段', r.commit?.hash);
      continue;
    }
    const skipWhenNoSnippets = config.notifications?.skipWhenNoSnippets ?? true;
    // 跳过：未提取到片段（可配置，默认启用）
    if (skipWhenNoSnippets && (!r.snippets || r.snippets.length === 0)) {
      console.log('[notifiers] 跳过发送：未提取到片段', r.commit?.hash);
      continue;
    }
    // 兼容旧行为：当未提取到片段且用于审查的diff为空
    if ((!r.snippets || r.snippets.length === 0) && r.usedDiffEmpty) {
      console.log('[notifiers] 跳过发送：无片段且diff为空', r.commit?.hash);
      continue;
    }

    const message = buildMessage(r, config);
    const authorEmail = r.commit.authorEmail;
    const larkOpenId = config.mention_map?.email_to_lark_open_id?.[authorEmail];
    const wecomUserId = config.mention_map?.email_to_wecom_userid?.[authorEmail];

    const larkCfg = config.notifications?.lark;
    if (larkCfg?.enabled) {
      if (larkCfg.webhook) {
        await sendToLark({ webhook: larkCfg.webhook, message, openId: larkOpenId, authorName: r.commit.authorName });
      } else {
        console.warn('[notifiers] 已启用飞书但缺少webhook，已跳过发送');
      }
    }

    const wecomCfg = config.notifications?.wecom;
    if (wecomCfg?.enabled) {
      if (wecomCfg.webhook) {
        await sendToWeCom({ webhook: wecomCfg.webhook, message, userId: wecomUserId, authorName: r.commit.authorName });
      } else {
        console.warn('[notifiers] 已启用企业微信但缺少webhook，已跳过发送');
      }
    }

    const emailCfg = config.notifications?.email;
    if (emailCfg?.enabled) {
      if (emailCfg.smtp?.host && emailCfg.from) {
        const style = config.notifications?.reportStyle || 'full';
        const subject = ['snippets_only','issues_only','issues_with_snippets'].includes(style) ? 'AI代码审核' : `AI代码审核: ${r.commit.message}`;
        await sendEmail({ smtp: emailCfg.smtp, from: emailCfg.from, to: authorEmail, subject, text: message });
      } else {
        console.warn('[notifiers] 已启用邮件但缺少SMTP或from，已跳过发送');
      }
    }
  }
}