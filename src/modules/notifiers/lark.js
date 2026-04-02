import axios from 'axios';
import crypto from 'crypto';

/**
 * 生成 webhook 签名（可选）
 */
function genSign(secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = crypto
    .createHmac('sha256', stringToSign)
    .update('')
    .digest('base64');

  return { timestamp, sign };
}

/**
 * 获取 tenant_access_token（应用机器人）
 */
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

/**
 * 统一发送函数
 */
export async function sendToLark(options) {
  const {
    // webhook 模式
    webhook,
    secret,

    // app 模式
    appId,
    appSecret,

    // 通用参数
    message,
    openId,
    chatId,
    authorName = '用户'
  } = options;

  if (!message) {
    throw new Error('[lark] message 不能为空');
  }

  // =========================
  // 🟢 模式1：群机器人 webhook
  // =========================
  if (webhook) {
    let text = message;

    // @人（webhook 机器人）
    if (openId) {
      text = `<at user_id="${openId}">${authorName}</at>\n${message}`;
    }

    const payload = {
      msg_type: 'text',
      content: { text }
    };

    // 签名（如果有）
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

  // =========================
  // 🔵 模式2：应用机器人 App
  // =========================
  if (appId && appSecret) {
    try {
      const token = await getTenantAccessToken(appId, appSecret);

      let receiveId;
      let receiveIdType;

      // 优先发群
      if (chatId) {
        receiveId = chatId;
        receiveIdType = 'chat_id';
      } else if (openId) {
        receiveId = openId;
        receiveIdType = 'open_id';
      } else {
        throw new Error('[lark] app 模式必须提供 openId 或 chatId');
      }

      let text = message;

      // 群里 @人
      if (chatId && openId) {
        text = `<at user_id="${openId}">${authorName}</at> ${message}`;
      }

      const res = await axios.post(
        'https://open.feishu.cn/open-apis/im/v1/messages',
        {
          receive_id: receiveId,
          msg_type: 'text',
          content: JSON.stringify({ text })
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

  // =========================
  // ❌ 未配置
  // =========================
  throw new Error('[lark] 未提供 webhook 或 appId/appSecret');
}