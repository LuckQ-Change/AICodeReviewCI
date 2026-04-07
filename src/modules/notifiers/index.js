import { sendToLark } from './lark.js';
import { sendToWeCom } from './wecom.js';
import { sendEmail } from './email.js';
import { retryAsync } from '../retry.js';

export function mdToHtml(md) {
  if (!md) return '';

  return md
    .replace(/^### (.*$)/gim, '<h3 style="color: #333; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4 style="color: #555; margin-top: 15px; margin-bottom: 5px;">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background: #f1f1f1; color: #e83e8c; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>')
    .replace(/^\d+\. (.*$)/gim, '<div style="margin-left: 10px; margin-bottom: 5px;">$&</div>')
    .replace(/^- (.*$)/gim, '<div style="margin-left: 10px; margin-bottom: 5px;">- $1</div>')
    .replace(/\n/g, '<br/>');
}

function buildStructuredIssueLines(result) {
  const issues = result.structuredReview?.issues || [];
  if (!issues.length) {
    return result.structuredReview?.summary || '未检测到问题';
  }

  const lines = [result.structuredReview?.summary || '发现以下问题：', ''];
  issues.forEach((issue, index) => {
    lines.push(
      `${index + 1}. [${issue.severity}] ${issue.file}:${issue.line}`,
      `问题: ${issue.issue}`,
      `建议: ${issue.suggestion}`
    );
  });
  return lines.join('\n');
}

export function buildMessage(result, config, format = 'markdown') {
  const c = result.commit;
  const style = config.notifications?.reportStyle || 'full';
  const isHtml = format === 'html';
  const structuredText = buildStructuredIssueLines(result);
  const reviewBody = result.structuredReview ? structuredText : result.reviewText;
  const reviewHtml = isHtml ? mdToHtml(reviewBody) : reviewBody;

  if (style === 'issues_only' || style === 'issues_with_snippets') {
    const content = reviewHtml || '（未检测到问题）';
    if (!isHtml) return content;

    return `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 8px;">审查建议</h2>
        <div style="background: #fdfdfe; padding: 15px; border-radius: 4px;">${content}</div>
      </div>
    `;
  }

  if (!isHtml) {
    const header = `AI代码审查结果\n仓库提交: ${c.hash}\n作者: ${c.authorName} <${c.authorEmail}>\n时间: ${c.date}\n说明: ${c.message}`;
    return `${header}\n\n审查建议:\n${reviewBody}`;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #007bff; color: white; padding: 25px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 600;">AI 代码审查报告</h1>
      </div>
      <div style="padding: 25px;">
        <div style="margin-bottom: 30px;">
          <h3 style="color: #444; border-bottom: 2px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 15px;">提交信息</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #777; width: 90px;">提交</td><td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; background: #f0f0f0; padding: 3px 8px; border-radius: 4px; color: #d63384;">${c.hash.substring(0, 8)}</td></tr>
            <tr><td style="padding: 6px 0; color: #777;">作者</td><td><strong style="color: #333;">${c.authorName}</strong> <span style="color: #666;">&lt;${c.authorEmail}&gt;</span></td></tr>
            <tr><td style="padding: 6px 0; color: #777;">时间</td><td style="color: #555;">${c.date}</td></tr>
            <tr><td style="padding: 6px 0; color: #777;">说明</td><td style="color: #333; font-weight: 500;">${c.message}</td></tr>
            <tr><td style="padding: 6px 0; color: #777;">输出模式</td><td style="color: #555;">${result.parseMode || 'unknown'}</td></tr>
          </table>
        </div>
        <div style="margin-top: 20px;">
          <h3 style="color: #444; border-bottom: 2px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 15px;">审查建议</h3>
          <div style="background: #fff; border: 1px solid #f0f0f0; border-left: 5px solid #007bff; padding: 20px; border-radius: 4px;">
            ${reviewHtml}
          </div>
        </div>
      </div>
      <div style="background: #f8f9fa; color: #999; padding: 15px; font-size: 12px; text-align: center; border-top: 1px solid #eee;">
        此邮件由 AI Code Review CI 自动生成并发送。
      </div>
    </div>
  `;
}

export function shouldSkipNotification(result, config) {
  if (result.skipped) {
    return { skip: true, reason: '审查阶段标记为未识别到代码片段' };
  }

  const skipWhenNoSnippets = config.notifications?.skipWhenNoSnippets ?? true;
  if (skipWhenNoSnippets && (!result.snippets || result.snippets.length === 0)) {
    return { skip: true, reason: '未提取到有效代码片段' };
  }

  if ((!result.snippets || result.snippets.length === 0) && result.usedDiffEmpty) {
    return { skip: true, reason: '没有可用片段且 diff 为空' };
  }

  return { skip: false };
}

export async function notifyResults({ config, results }) {
  const stats = {
    skipped: 0,
    larkSuccess: 0,
    larkFailed: 0,
    wecomSuccess: 0,
    wecomFailed: 0,
    emailSuccess: 0,
    emailFailed: 0
  };

  for (const r of results) {
    const skipDecision = shouldSkipNotification(r, config);
    if (skipDecision.skip) {
      console.log(`[notifiers] 跳过发送：${skipDecision.reason}`, r.commit?.hash);
      stats.skipped += 1;
      continue;
    }

    const authorEmail = r.commit.authorEmail;
    const larkOpenId = config.mention_map?.email_to_lark_open_id?.[authorEmail];
    const wecomUserId = config.mention_map?.email_to_wecom_userid?.[authorEmail];

    const larkCfg = config.notifications?.lark;
    if (larkCfg?.enabled) {
      try {
        const larkMessage = buildMessage(r, config, 'markdown');
        await retryAsync(() => sendToLark({
          webhook: larkCfg.webhook,
          secret: larkCfg.secret,
          appId: larkCfg.appId,
          appSecret: larkCfg.appSecret,
          chatId: larkCfg.chatId,
          message: larkMessage,
          openId: larkOpenId,
          authorName: r.commit.authorName
        }), config.notifications?.retry);
        stats.larkSuccess += 1;
      } catch (err) {
        stats.larkFailed += 1;
        console.error('[notifiers] 飞书发送失败', err.response?.data || err.message);
      }
    }

    const wecomCfg = config.notifications?.wecom;
    if (wecomCfg?.enabled && wecomCfg.webhook) {
      try {
        const wecomMessage = buildMessage(r, config, 'markdown');
        await retryAsync(
          () => sendToWeCom({ webhook: wecomCfg.webhook, message: wecomMessage, userId: wecomUserId, authorName: r.commit.authorName }),
          config.notifications?.retry
        );
        stats.wecomSuccess += 1;
      } catch (err) {
        stats.wecomFailed += 1;
        console.error('[notifiers] 企业微信发送失败', err.response?.data || err.message);
      }
    }

    const emailCfg = config.notifications?.email;
    if (emailCfg?.enabled && emailCfg.smtp?.host && emailCfg.from) {
      try {
        const style = config.notifications?.reportStyle || 'full';
        const subject = ['snippets_only', 'issues_only', 'issues_with_snippets'].includes(style)
          ? 'AI代码审查'
          : `AI代码审查: ${r.commit.message}`;
        const htmlContent = buildMessage(r, config, 'html');
        const textContent = buildMessage(r, config, 'markdown');

        await retryAsync(
          () => sendEmail({
            smtp: emailCfg.smtp,
            from: emailCfg.from,
            to: authorEmail,
            subject,
            text: textContent,
            html: htmlContent
          }),
          config.notifications?.retry
        );
        stats.emailSuccess += 1;
      } catch (err) {
        stats.emailFailed += 1;
        console.error('[notifiers] 邮件发送失败', err.message);
      }
    }
  }

  return stats;
}
