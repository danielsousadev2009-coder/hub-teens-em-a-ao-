import { config } from '../config/env.js';

export class ProviderUnavailableError extends Error {
  constructor(message = 'A mentora não está disponível no momento.') {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.status = 503;
    this.code = 'mentor_unavailable';
  }
}

export function isLocalOllama() {
  try {
    const url = new URL(config.ai.ollamaUrl);
    const host = (url.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function availableProviders() {
  return {
    gemini: Boolean(config.ai.geminiApiKey),
    groq: Boolean(config.ai.groqApiKey),
    ollama: Boolean(config.ai.ollamaModel) && isLocalOllama(),
  };
}

export async function generateReply(provider, messages) {
  const systemPrompt =
    'Você é a IA Mentora do HUB TEENS EM AÇÃO. ' +
    'Ajude estudantes com orientações educativas, seguras e respeitosas. ' +
    'Não solicite dados pessoais. Incentive a validação de fatos e a colaboração.';

  if (provider === 'gemini' && config.ai.geminiApiKey) {
    const model = encodeURIComponent(config.ai.geminiModel);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.ai.geminiApiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new ProviderUnavailableError();
    }

    if (!res.ok) throw new ProviderUnavailableError();
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply || !reply.trim()) throw new ProviderUnavailableError();
    return reply;
  }

  if (provider === 'groq' && config.ai.groqApiKey) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const payload = {
      model: config.ai.groqModel,
      messages: formattedMessages,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.groqApiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ProviderUnavailableError();
    }

    if (!res.ok) throw new ProviderUnavailableError();
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || !reply.trim()) throw new ProviderUnavailableError();
    return reply;
  }

  if (provider === 'ollama' && config.ai.ollamaModel && isLocalOllama()) {
    const url = `${config.ai.ollamaUrl}/api/chat`;
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const payload = {
      model: config.ai.ollamaModel,
      stream: false,
      messages: formattedMessages,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ProviderUnavailableError();
    }

    if (!res.ok) throw new ProviderUnavailableError();
    const data = await res.json();
    const reply = data?.message?.content;
    if (!reply || !reply.trim()) throw new ProviderUnavailableError();
    return reply;
  }

  throw new ProviderUnavailableError('O provedor escolhido não está configurado ou não está disponível.');
}

