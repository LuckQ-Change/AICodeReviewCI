import nodemailer from 'nodemailer';

/**
 * 发送邮件通知
 * 增加了超时设置和基本的日志输出以提高生产环境的健壮性
 */
export async function sendEmail({ smtp, from, to, subject, text, html }) {
  if (!smtp?.host) throw new Error('缺少SMTP配置');

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 465,
    secure: smtp.secure ?? true,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    // 超时设置（解决 AI 审核提出的建议）
    connectionTimeout: 10000, // 10s
    greetingTimeout: 10000,
    socketTimeout: 30000
  });

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[email] 邮件发送成功: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[email] 邮件发送失败: ${err.message}`);
    throw err;
  }
}