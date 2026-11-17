import { createClient } from '@supabase/supabase-js';

/**
 * 模型配置表：所有模型共用一套请求代码
 * 这四家都提供 OpenAI 兼容网关，入参 / SSE 分片格式 / 鉴权头完全一致，
 * 所以只要把 baseURL、apiKey、model 三样东西放进字典，就能一段 fetch 通吃。
 */
const modelConfigMap = {
  doubao: {
    label: '豆包（火山方舟）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v1',
    apiKey: process.env.DOUBAO_API_KEY,
    model: process.env.DOUBAO_MODEL || 'doubao-seed-1-6-250615',
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
  },
  qwen: {
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
    model: 'qwen-plus',
  },
  kimi: {
    label: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: process.env.KIMI_API_KEY,
    model: 'moonshot-v1-8k',
  },
};

const SYSTEM_PROMPT = `你是一位专业的中文起名顾问。根据用户给出的起名需求（性别、风格、姓氏、寓意偏好等），给出 3 组名字方案。

输出要求：
1. 严格输出 3 组，每组包含：名字、读音、寓意解释（30 字以内）、适用场景。
2. 格式为 Markdown，每组用 "### 1. 名字" 这样的三级标题开头，下面用小段落写读音与寓意。
3. 如果用户指定了姓氏，名字要包含姓；没指定就只给名。
4. 不要寒暄、不要解释你在做什么，直接开始给名字。`;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function saveHistory({ requirement, result, model }) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[history] 未配置 SUPABASE_URL / SUPABASE_ANON_KEY，跳过入库');
    return;
  }
  try {
    const { error } = await supabase.from('name_history').insert({
      user_requirement: requirement,
      name_result: result,
      model_name: model,
    });
    if (error) console.error('[history] 入库失败:', error.message);
  } catch (err) {
    console.error('[history] 入库异常:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '只支持 POST 请求' });
    return;
  }

  const { requirement = '', model = 'doubao' } = req.body || {};
  const trimmed = String(requirement).trim();

  if (!trimmed) {
    res.status(400).json({ error: '请先填写起名需求' });
    return;
  }

  const cfg = modelConfigMap[model];
  if (!cfg) {
    res.status(400).json({ error: `未知模型：${model}` });
    return;
  }
  if (!cfg.apiKey) {
    res.status(400).json({ error: `后端未配置 ${cfg.label} 的 API Key（环境变量缺失）` });
    return;
  }

  // SSE 流式响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const send = (obj) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  let fullText = '';

  try {
    const upstream = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmed },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errBody = await upstream.text();
      let msg = `上游接口返回 ${upstream.status}`;
      try {
        const parsed = JSON.parse(errBody);
        msg = parsed.error?.message || parsed.message || msg;
      } catch (_) {
        if (errBody) msg = errBody.slice(0, 300);
      }
      send({ error: msg });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (closed) {
        reader.cancel().catch(() => {});
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('data:')) continue;
        const payload = trimmedLine.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            send({ content: delta });
          }
        } catch (_) {
          // 忽略无法解析的分片
        }
      }
    }

    send({ done: true, model, label: cfg.label });
    res.write('data: [DONE]\n\n');

    if (fullText.trim()) {
      await saveHistory({ requirement: trimmed, result: fullText, model });
    }
  } catch (err) {
    console.error('[name] 调用失败:', err);
    send({ error: err.message || '调用模型失败' });
    res.write('data: [DONE]\n\n');
  } finally {
    res.end();
  }
}
