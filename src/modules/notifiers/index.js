import { sendToLark } from './lark.js';
import { sendToWeCom } from './wecom.js';
import { sendEmail } from './email.js';

function buildMessage(result, config, format = 'markdown') {
  const c = result.commit;
  const style = config.notifications?.reportStyle || 'full';
  const isHtml = format === 'html';

  // 仅问题：只显示审查建议
  if (style === 'issues_only' || style === 'issues_with_snippets') {
    const issues = (result.reviewText || '').trim();
    const content = issues || '（未检出问题）';
    if (!isHtml) return content;
    
    return `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 8px;">审查建议</h2>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${content}</div>
      </div>
    `;
  }

  // 完整模式
  if (!isHtml) {
    const header = `AI代码审核结果\n仓库提交: ${c.hash}\n作者: ${c.authorName} <${c.authorEmail}>\n时间: ${c.date}\n说明: ${c.message}`;
    return `${header}\n\n审查建议:\n${result.reviewText}`;
  }

  // 邮件 HTML 样式
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <div style="background: #007bff; color: white; padding: 20px;">
        <h1 style="margin: 0; font-size: 24px;">AI 代码审核报告</h1>
      </div>
      <div style="padding: 20px;">
        <h3 style="color: #555; border-bottom: 1px solid #eee; padding-bottom: 8px;">提交信息</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #888; width: 80px;">仓库提交</td><td style="font-family: monospace; background: #eee; padding: 2px 5px;">${c.hash}</td></tr>
          <tr><td style="padding: 8px 0; color: #888;">作者</td><td><b>${c.authorName}</b> &lt;${c.authorEmail}&gt;</td></tr>
          <tr><td style="padding: 8px 0; color: #888;">时间</td><td>${c.date}</td></tr>
          <tr><td style="padding: 8px 0; color: #888;">说明</td><td>${c.message}</td></tr>
        </table>
        
        <h3 style="color: #555; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-top: 30px;">审查建议</h3>
        <div style="background: #fdfdfe; border-left: 4px solid #007bff; padding: 15px; margin: 10px 0; white-space: pre-wrap; font-size: 15px;">${result.reviewText}</div>
      </div>
      <div style="background: #f8f9fa; color: #888; padding: 15px; font-size: 12px; text-align: center;">
        此邮件由 AI Code Review CI 自动发送
      </div>
    </div>
  `;
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

    const authorEmail = r.commit.authorEmail;
    const larkOpenId = config.mention_map?.email_to_lark_open_id?.[authorEmail];
    const wecomUserId = config.mention_map?.email_to_wecom_userid?.[authorEmail];

    // 1. 飞书通知 (使用适配飞书的 Markdown)
    const larkCfg = config.notifications?.lark;
    if (larkCfg?.enabled) {
      try {
        const larkMessage = buildMessage(r, config, 'markdown');
        await sendToLark({
          webhook: larkCfg.webhook,
          secret: larkCfg.secret,
          appId: larkCfg.appId,
          appSecret: larkCfg.appSecret,
          chatId: larkCfg.chatId,
          message: larkMessage,
          openId: larkOpenId,
          authorName: r.commit.authorName
        });
      } catch (err) {
        console.error('[notifiers] 飞书发送失败:', err.response?.data || err.message);
      }
    }

    // 2. 企业微信通知 (保持 Markdown)
    const wecomCfg = config.notifications?.wecom;
    if (wecomCfg?.enabled && wecomCfg.webhook) {
      try {
        const wecomMessage = buildMessage(r, config, 'markdown');
        await sendToWeCom({ webhook: wecomCfg.webhook, message: wecomMessage, userId: wecomUserId, authorName: r.commit.authorName });
      } catch (err) {
        console.error('[notifiers] 企业微信发送失败:', err.response?.data || err.message);
      }
    }

    // 3. 邮件通知 (使用 HTML 格式)
    const emailCfg = config.notifications?.email;
    if (emailCfg?.enabled && emailCfg.smtp?.host && emailCfg.from) {
      try {
        const style = config.notifications?.reportStyle || 'full';
        const subject = ['snippets_only','issues_only','issues_with_snippets'].includes(style) ? 'AI代码审核' : `AI代码审核: ${r.commit.message}`;
        const htmlContent = buildMessage(r, config, 'html');
        const textContent = buildMessage(r, config, 'markdown'); // 备用纯文本
        
        await sendEmail({ 
          smtp: emailCfg.smtp, 
          from: emailCfg.from, 
          to: authorEmail, 
          subject, 
          text: textContent,
          html: htmlContent 
        });
      } catch (err) {
        console.error('[notifiers] 邮件发送失败:', err.message);
      }
    }
  }
}