import nodemailer from 'nodemailer';

/**
 * 严格按配置构造 SMTP 传输参数，避免代码层再引入隐式推断规则。
 */
export function buildSmtpTransportOptions(smtp = {}) {
  const transport = {
    host: smtp.host,
    port: smtp.port || 465,
    secure: typeof smtp.secure === 'boolean' ? smtp.secure : false,
    requireTLS: typeof smtp.requireTLS === 'boolean' ? smtp.requireTLS : false,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: smtp.connectionTimeout || 10000,
    greetingTimeout: smtp.greetingTimeout || 15000,
    socketTimeout: smtp.socketTimeout || 30000
  };

  if (smtp.name) {
    transport.name = smtp.name;
  }

  if (typeof smtp.ignoreTLS === 'boolean') {
    transport.ignoreTLS = smtp.ignoreTLS;
  }

  if (smtp.tls?.servername || typeof smtp.tls?.rejectUnauthorized === 'boolean') {
    transport.tls = {};
    if (smtp.tls.servername) {
      transport.tls.servername = smtp.tls.servername;
    }
    if (typeof smtp.tls.rejectUnauthorized === 'boolean') {
      transport.tls.rejectUnauthorized = smtp.tls.rejectUnauthorized;
    }
  }

  return transport;
}

/**
 * 发送邮件通知。
 * 增加超时配置，并避免在日志中输出完整凭证。
 */
export async function sendEmail({ smtp, from, to, subject, text, html }) {
  if (!smtp?.host) throw new Error('缺少 SMTP 配置');

  const transportOptions = buildSmtpTransportOptions(smtp);
  const transporter = nodemailer.createTransport(transportOptions);

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[email] 邮件发送成功: ${info.messageId}`);
    return info;
  } catch (err) {
    const safeMessage = smtp.user ? err.message.replaceAll(smtp.user, '') : err.message;
    console.error('[email] 邮件发送失败', {
      host: transportOptions.host,
      port: transportOptions.port,
      secure: transportOptions.secure,
      requireTLS: transportOptions.requireTLS,
      error: safeMessage,
      stack: err.stack
    });
    throw err;
  }
}
