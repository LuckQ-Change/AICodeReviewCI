import axios from 'axios';
import crypto from 'crypto';

function genSign(secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = crypto
    .createHmac('sha256', stringToSign)
    .update('')
    .digest('base64');

  return { timestamp, sign };
}

async function getTenantAccessToken(appId, appSecret) {
  const res = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      app_id: appId,
      app_secret: appSecret
    }
  );

  return res.data.tenant_access_token;
}

function formatMarkdownForLark(text) {
  if (!text) return '';
  return text.replace(/```[a-z]*\n/gi, '```\n');
}

export async function sendToLark(options) {
  const {
    webhook,
    secret,
    appId,
    appSecret,
    message,
    openId,
    chatId,
    authorName = '用户'
  } = options;

  if (!message) {
    throw new Error('[lark] message 不能为空');
  }

  const formattedMessage = formatMarkdownForLark(message);

  if (webhook) {
    let text = formattedMessage;

    if (openId) {
      text = `<at user_id="${openId}">${authorName}</at>\n${formattedMessage}`;
    }

    const payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: 'AI 代码审查结果'
          },
          template: 'blue'
        },
        elements: [
          {
            tag: 'markdown',
            content: text
          }
        ]
      }
    };

    if (secret) {
      const { timestamp, sign } = genSign(secret);
      payload.timestamp = timestamp;
      payload.sign = sign;
    }

    try {
      const res = await axios.post(webhook, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('[lark:webhook] success', res.data);
      return res.data;
    } catch (err) {
      console.error('[lark:webhook] fail', err.response?.data || err.message);
      throw err;
    }
  }

  if (appId && appSecret) {
    try {
      const token = await getTenantAccessToken(appId, appSecret);

      let receiveId;
      let receiveIdType;

      if (chatId) {
        receiveId = chatId;
        receiveIdType = 'chat_id';
      } else if (openId) {
        receiveId = openId;
        receiveIdType = 'open_id';
      } else {
        throw new Error('[lark] app 模式必须提供 openId 或 chatId');
      }

      let text = formattedMessage;
      if (chatId && openId) {
        text = `<at user_id="${openId}">${authorName}</at>\n${formattedMessage}`;
      }

      const card = {
        header: {
          title: {
            tag: 'plain_text',
            content: 'AI 代码审查结果'
          },
          template: 'blue'
        },
        elements: [
          {
            tag: 'markdown',
            content: text
          }
        ]
      };

      const res = await axios.post(
        'https://open.feishu.cn/open-apis/im/v1/messages',
        {
          receive_id: receiveId,
          msg_type: 'interactive',
          content: JSON.stringify(card)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          params: {
            receive_id_type: receiveIdType
          }
        }
      );

      console.log('[lark:app] success', res.data);
      return res.data;
    } catch (err) {
      console.error('[lark:app] fail', err.response?.data || err.message);
      throw err;
    }
  }

  throw new Error('[lark] 未提供 webhook 或 appId/appSecret');
}
