import { config } from '../config/env.js';
import { getSetting, setSetting, maskSecret } from './systemSettings.js';

export class ProviderUnavailableError extends Error {
  constructor(message = 'A mentora não está disponível no momento.') {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.status = 503;
    this.code = 'mentor_unavailable';
  }
}

export const SUPPORTED_MODELS = {
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recomendado - Mais rápido)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Raciocínio avançado)' },
  ],
  miniroot: [
    { id: 'miniroot-default', name: 'MiniRoot Default (Em manutenção)' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)' },
  ],
  ollama: [
    { id: 'llama3:8b', name: 'Llama 3 8B (Local)' },
  ],
};

export function isLocalOllama() {
  try {
    const url = new URL(config.ai.ollamaUrl);
    const host = (url.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

// In-memory runtime override cache for dynamic settings
const dynamicSettings = {
  activeProvider: null,
  geminiApiKey: null,
  geminiModel: null,
  minirootBaseUrl: null,
  minirootApiKey: null,
  minirootModel: null,
};

export async function initAiSettings() {
  dynamicSettings.geminiApiKey = await getSetting('ai_gemini_api_key', config.ai.geminiApiKey);
  dynamicSettings.geminiModel = await getSetting('ai_gemini_model', config.ai.geminiModel || 'gemini-2.0-flash');
  dynamicSettings.minirootBaseUrl = await getSetting('ai_miniroot_base_url', '');
  dynamicSettings.minirootApiKey = await getSetting('ai_miniroot_api_key', '');
  dynamicSettings.minirootModel = await getSetting('ai_miniroot_model', 'miniroot-default');
  dynamicSettings.activeProvider = await getSetting('ai_active_provider', 'gemini');
}

export function updateAiRuntimeCache(updates) {
  if (updates.geminiApiKey !== undefined) dynamicSettings.geminiApiKey = updates.geminiApiKey;
  if (updates.geminiModel !== undefined) dynamicSettings.geminiModel = updates.geminiModel;
  if (updates.minirootBaseUrl !== undefined) dynamicSettings.minirootBaseUrl = updates.minirootBaseUrl;
  if (updates.minirootApiKey !== undefined) dynamicSettings.minirootApiKey = updates.minirootApiKey;
  if (updates.minirootModel !== undefined) dynamicSettings.minirootModel = updates.minirootModel;
  if (updates.activeProvider !== undefined) dynamicSettings.activeProvider = updates.activeProvider;
}

export async function getAiConfig() {
  const geminiApiKey = (dynamicSettings.geminiApiKey ?? await getSetting('ai_gemini_api_key', config.ai.geminiApiKey)) || '';
  const geminiModel = (dynamicSettings.geminiModel ?? await getSetting('ai_gemini_model', config.ai.geminiModel)) || 'gemini-2.0-flash';
  const minirootBaseUrl = (dynamicSettings.minirootBaseUrl ?? await getSetting('ai_miniroot_base_url', '')) || '';
  const minirootApiKey = (dynamicSettings.minirootApiKey ?? await getSetting('ai_miniroot_api_key', '')) || '';
  const minirootModel = (dynamicSettings.minirootModel ?? await getSetting('ai_miniroot_model', 'miniroot-default')) || 'miniroot-default';
  const activeProvider = (dynamicSettings.activeProvider ?? await getSetting('ai_active_provider', 'gemini')) || 'gemini';

  return {
    activeProvider,
    geminiApiKey,
    geminiModel,
    minirootBaseUrl,
    minirootApiKey,
    minirootModel,
    groqApiKey: config.ai.groqApiKey,
    groqModel: config.ai.groqModel,
    ollamaUrl: config.ai.ollamaUrl,
    ollamaModel: config.ai.ollamaModel,
  };
}

export function availableProviders() {
  const geminiKey = dynamicSettings.geminiApiKey ?? config.ai.geminiApiKey;
  const groqKey = config.ai.groqApiKey;
  const ollamaModel = config.ai.ollamaModel;
  return {
    gemini: Boolean(geminiKey),
    miniroot: false, // Em manutenção/reparo futuro
    groq: Boolean(groqKey),
    ollama: Boolean(ollamaModel) && isLocalOllama(),
  };
}

export async function testGeminiConnection(apiKey, model = 'gemini-2.0-flash') {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return {
      success: false,
      message: 'Chave de API do Gemini não foi informada.',
      code: 'missing_key',
    };
  }

  const cleanKey = apiKey.trim();
  const startTime = Date.now();

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const modelsList = Array.isArray(data.models) ? data.models.map(m => m.name.replace('models/', '')) : [];
      return {
        success: true,
        message: `Conexão com Google Gemini realizada com sucesso! (Latência: ${latencyMs}ms)`,
        latencyMs,
        availableModels: modelsList.slice(0, 5),
      };
    }

    if (res.status === 400 || res.status === 403) {
      return {
        success: false,
        message: 'Chave de API do Google Gemini inválida ou não autorizada (HTTP ' + res.status + ').',
        code: 'invalid_key',
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        message: 'Cota de requisições excedida no Google Gemini (RESOURCE_EXHAUSTED).',
        code: 'quota_exceeded',
      };
    }

    return {
      success: false,
      message: `A API do Google Gemini retornou erro HTTP ${res.status}.`,
      code: 'api_error',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        message: 'Tempo limite excedido ao conectar à API do Google Gemini (Timeout).',
        code: 'timeout',
      };
    }
    return {
      success: false,
      message: `Falha de rede ao conectar com o Google Gemini: ${err.message}`,
      code: 'network_error',
    };
  }
}

export async function testMiniRootConnection(baseUrl, apiKey, model) {
  return {
    success: false,
    message: 'O provedor MiniRoot está em fase de diagnóstico e manutenção para reparos futuros. Utilize o Google Gemini como alternativa temporária.',
    code: 'under_repair',
    status: 'under_repair',
  };
}

export async function generateReply(provider, messages) {
  const systemPrompt =
    'Você é a IA Mentora do HUB TEENS EM AÇÃO. ' +
    'Ajude estudantes com orientações educativas, seguras e respeitosas. ' +
    'Não solicite dados pessoais. Incentive a validação de fatos e a colaboração.';

  const aiCfg = await getAiConfig();

  if (provider === 'gemini') {
    if (!aiCfg.geminiApiKey) {
      throw new ProviderUnavailableError('A chave da API do Google Gemini não está configurada no backend.');
    }

    const model = encodeURIComponent(aiCfg.geminiModel || 'gemini-2.0-flash');
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': aiCfg.geminiApiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ProviderUnavailableError('Tempo limite excedido ao consultar o Google Gemini. Tente novamente.');
      }
      throw new ProviderUnavailableError('Falha de conexão com os servidores do Google Gemini.');
    }

    if (!res.ok) {
      if (res.status === 429) {
        throw new ProviderUnavailableError('Limite de requisições do Google Gemini excedido. Aguarde alguns instantes.');
      }
      if (res.status === 400 || res.status === 403) {
        throw new ProviderUnavailableError('Erro de autenticação com o Google Gemini. Verifique a chave de API.');
      }
      throw new ProviderUnavailableError(`O Google Gemini retornou erro HTTP ${res.status}.`);
    }

    const data = await res.json().catch(() => null);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply || !reply.trim()) {
      throw new ProviderUnavailableError('O Google Gemini retornou uma resposta vazia.');
    }
    return reply.trim();
  }

  if (provider === 'miniroot') {
    throw new ProviderUnavailableError(
      'O provedor MiniRoot está atualmente em manutenção e diagnóstico para reparos futuros. ' +
      'Por favor, utilize o Google Gemini como provedor ativo.'
    );
  }

  if (provider === 'groq' && aiCfg.groqApiKey) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const payload = {
      model: aiCfg.groqModel || 'llama-3.3-70b-versatile',
      messages: formattedMessages,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiCfg.groqApiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ProviderUnavailableError('Falha ao conectar ao serviço Groq.');
    }

    if (!res.ok) throw new ProviderUnavailableError(`Groq retornou erro HTTP ${res.status}.`);
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || !reply.trim()) throw new ProviderUnavailableError('Groq retornou uma resposta vazia.');
    return reply.trim();
  }

  if (provider === 'ollama' && aiCfg.ollamaModel && isLocalOllama()) {
    const url = `${aiCfg.ollamaUrl}/api/chat`;
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const payload = {
      model: aiCfg.ollamaModel,
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
      throw new ProviderUnavailableError('Falha ao conectar com o serviço Ollama local.');
    }

    if (!res.ok) throw new ProviderUnavailableError(`Ollama retornou erro HTTP ${res.status}.`);
    const data = await res.json();
    const reply = data?.message?.content;
    if (!reply || !reply.trim()) throw new ProviderUnavailableError('Ollama retornou resposta vazia.');
    return reply.trim();
  }

  throw new ProviderUnavailableError('O provedor escolhido não está configurado ou não está disponível.');
}
