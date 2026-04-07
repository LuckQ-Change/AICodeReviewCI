import axios from 'axios';

export async function sendToWeCom({ webhook, message, userId, authorName }) {
  if (!webhook) throw new Error('缺少企业微信 webhook');

  let content = message;
  if (userId) {
    content = `<@${userId}>\n${message}`;
  } else {
    content = `@${authorName}\n${message}`;
  }

  const payload = {
    msgtype: 'markdown',
    markdown: { content }
  };

  await axios.post(webhook, payload);
}
