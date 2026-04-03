import nodemailer from 'nodemailer';

export async function sendEmail({ smtp, from, to, subject, text, html }) {
  if (!smtp?.host) throw new Error('缺少SMTP配置');
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 465,
    secure: smtp.secure ?? true,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined
  });
  await transporter.sendMail({ from, to, subject, text, html });
}