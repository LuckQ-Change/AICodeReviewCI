import { sendToLark } from './lark.js';
import { sendToWeCom } from './wecom.js';
import { sendEmail } from './email.js';

function mdToHtml(md) {
  if (!md) return '';
  let html = md
    // 处理标题 (###, ####)
    .replace(/^### (.*$)/gim, '<h3 style="color: #333; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4 style="color: #555; margin-top: 15px; margin-bottom: 5px;">$1</h4>')
    // 处理加粗
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // 处理代码块 (```javascript)
    .replace(/```javascript([\s\S]*?)```/gim, '<pre style="background: #f4f4f4; padding: 12px; border-radius: 4px; border-left: 4px solid #6c757d; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #333; line-height: 1.4; margin: 10px 0; overflow-x: auto;"><code>$1</code></pre>')
    // 处理行内代码
    .replace(/`(.*?)`/g, '<code style="background: #f1f1f1; color: #e83e8c; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>')
    // 处理列表
    .replace(/^\d+\. (.*$)/gim, '<div style="margin-left: 10px; margin-bottom: 5px;">$0</div>')
    .replace(/^- (.*$)/gim, '<div style="margin-left: 10px; margin-bottom: 5px;">• $1</div>')
    // 处理换行 (将剩余的换行转为 <br/>)
    .replace(/\n/g, '<br/>');

  return html;
}

function buildMessage(result, config, format = 'markdown') {
  const c = result.commit;
  const style = config.notifications?.reportStyle || 'full';
  const isHtml = format === 'html';

  // 渲染正文
  const reviewHtml = isHtml ? mdToHtml(result.reviewText) : result.reviewText;

  // 仅问题：只显示审查建议
  if (style === 'issues_only' || style === 'issues_with_snippets') {
    const content = reviewHtml || '（未检出问题）';
    if (!isHtml) return content;
    
    return `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 8px;">审查建议</h2>
        <div style="background: #fdfdfe; padding: 15px; border-radius: 4px;">${content}</div>
      </div>
    `;
  }

  // 完整模式 - 纯文本
  if (!isHtml) {
    const header = `AI代码审核结果\n仓库提交: ${c.hash}\n作者: ${c.authorName} <${c.authorEmail}>\n时间: ${c.date}\n说明: ${c.message}`;
    return `${header}\n\n审查建议:\n${result.reviewText}`;
  }

  // 完整模式 - 邮件 HTML 样式
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #007bff; color: white; padding: 25px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 600;">AI 代码审核报告</h1>
      </div>
      <div style="padding: 25px;">
        <div style="margin-bottom: 30px;">
          <h3 style="color: #444; border-bottom: 2px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 15px;">🚀 提交信息</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #777; width: 90px;">仓库提交</td><td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; background: #f0f0f0; padding: 3px 8px; border-radius: 4px; color: #d63384;">${c.hash.substring(0, 8)}</td></tr>
            <tr><td style="padding: 6px 0; color: #777;">作者</td><td><strong style="color: #333;">${c.authorName}</strong> <span style="color: #666;">&lt;${c.authorEmail}&gt;</span></td></tr>
            <tr><td style="padding: 6px 0; color: #777;">时间</td><td style="color: #555;">${c.date}</td></tr>
            <tr><td style="padding: 6px 0; color: #777;">说明</td><td style="color: #333; font-weight: 500;">${c.message}</td></tr>
          </table>
        </div>
        
        <div style="margin-top: 20px;">
          <h3 style="color: #444; border-bottom: 2px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 15px;">🔍 审查建议</h3>
          <div style="background: #fff; border: 1px solid #f0f0f0; border-left: 5px solid #007bff; padding: 20px; border-radius: 4px;">
            ${reviewHtml}
          </div>
        </div>
      </div>
      <div style="background: #f8f9fa; color: #999; padding: 15px; font-size: 12px; text-align: center; border-top: 1px solid #eee;">
        此邮件由 AI Code Review CI 系统自动生成并发送
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