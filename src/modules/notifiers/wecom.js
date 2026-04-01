import axios from 'axios';

export async function sendToWeCom({ webhook, message, userId, authorName }) {
  if (!webhook) throw new Error('缺少企业微信webhook');
  let content = message;
  // 企业微信markdown支持<@userid>来@指定用户
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