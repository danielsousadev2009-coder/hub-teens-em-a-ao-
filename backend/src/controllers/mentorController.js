import { query, withTransaction } from '../config/database.js';
import {
  availableProviders,
  getAiConfig,
  generateReply,
  isLocalOllama,
  testGeminiConnection,
  testMiniRootConnection,
  updateAiRuntimeCache,
  SUPPORTED_MODELS,
} from '../utils/aiProviders.js';
import { setSetting, maskSecret } from '../utils/systemSettings.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function getMentorProviders(req, res, next) {
  try {
    const providers = await availableProviders();
    const aiCfg = await getAiConfig();

    res.json({
      providers: [
        {
          id: 'gemini',
          name: 'Google Gemini',
          configured: providers.gemini,
          isDefault: true,
          status: providers.gemini ? 'active' : 'needs_key',
        },
        {
          id: 'miniroot',
          name: 'MiniRoot AI',
          configured: false,
          status: 'under_repair',
          statusMessage: 'Em diagnóstico para reparo futuro. Use o Gemini temporariamente.',
        },
        {
          id: 'groq',
          name: 'Groq',
          configured: providers.groq,
          status: providers.groq ? 'ready' : 'not_configured',
        },
        {
          id: 'ollama',
          name: 'Ollama',
          configured: providers.ollama,
          status: providers.ollama ? 'ready' : 'not_configured',
        },
      ],
      activeProvider: aiCfg.activeProvider || 'gemini',
      external_data_notice:
        'Gemini e Groq recebem as mensagens enviadas. Não compartilhe dados pessoais, ' +
        'informações sensíveis ou dados de outros estudantes.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getAiAdminConfig(req, res, next) {
  try {
    const aiCfg = await getAiConfig();
    res.json({
      activeProvider: aiCfg.activeProvider,
      providers: {
        gemini: {
          id: 'gemini',
          name: 'Google Gemini',
          isConfigured: Boolean(aiCfg.geminiApiKey),
          maskedKey: maskSecret(aiCfg.geminiApiKey),
          model: aiCfg.geminiModel,
          supportedModels: SUPPORTED_MODELS.gemini,
          status: aiCfg.geminiApiKey ? 'ready' : 'pending_key',
        },
        miniroot: {
          id: 'miniroot',
          name: 'MiniRoot AI (Em diagnóstico)',
          isConfigured: false,
          status: 'under_repair',
          statusMessage: 'Integração em diagnóstico e preservada para reparo futuro. Utilize o Gemini temporariamente.',
          baseUrl: aiCfg.minirootBaseUrl || '',
          maskedKey: maskSecret(aiCfg.minirootApiKey),
          model: aiCfg.minirootModel,
          supportedModels: SUPPORTED_MODELS.miniroot,
        },
        groq: {
          id: 'groq',
          name: 'Groq',
          isConfigured: Boolean(aiCfg.groqApiKey),
          maskedKey: maskSecret(aiCfg.groqApiKey),
          model: aiCfg.groqModel,
          supportedModels: SUPPORTED_MODELS.groq,
        },
        ollama: {
          id: 'ollama',
          name: 'Ollama (Local)',
          isConfigured: Boolean(aiCfg.ollamaModel) && isLocalOllama(),
          model: aiCfg.ollamaModel,
          supportedModels: SUPPORTED_MODELS.ollama,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAiAdminConfig(req, res, next) {
  try {
    const {
      activeProvider,
      geminiApiKey,
      geminiModel,
      minirootBaseUrl,
      minirootApiKey,
      minirootModel,
    } = req.body;

    const runtimeUpdates = {};
    if (activeProvider && typeof activeProvider === 'string') {
      const allowed = ['gemini', 'miniroot', 'groq', 'ollama'];
      if (allowed.includes(activeProvider)) {
        await setSetting('ai_active_provider', activeProvider);
        runtimeUpdates.activeProvider = activeProvider;
      }
    }

    if (geminiApiKey !== undefined && typeof geminiApiKey === 'string') {
      const cleanKey = geminiApiKey.trim();
      await setSetting('ai_gemini_api_key', cleanKey);
      runtimeUpdates.geminiApiKey = cleanKey;
    }

    if (geminiModel && typeof geminiModel === 'string') {
      await setSetting('ai_gemini_model', geminiModel.trim());
      runtimeUpdates.geminiModel = geminiModel.trim();
    }

    if (minirootBaseUrl !== undefined && typeof minirootBaseUrl === 'string') {
      await setSetting('ai_miniroot_base_url', minirootBaseUrl.trim());
      runtimeUpdates.minirootBaseUrl = minirootBaseUrl.trim();
    }

    if (minirootApiKey !== undefined && typeof minirootApiKey === 'string') {
      await setSetting('ai_miniroot_api_key', minirootApiKey.trim());
      runtimeUpdates.minirootApiKey = minirootApiKey.trim();
    }

    if (minirootModel && typeof minirootModel === 'string') {
      await setSetting('ai_miniroot_model', minirootModel.trim());
      runtimeUpdates.minirootModel = minirootModel.trim();
    }

    updateAiRuntimeCache(runtimeUpdates);

    // Return updated config
    return getAiAdminConfig(req, res, next);
  } catch (err) {
    next(err);
  }
}

export async function testAiProviderEndpoint(req, res, next) {
  try {
    const { provider = 'gemini', apiKey, model, baseUrl } = req.body;
    const aiCfg = await getAiConfig();

    if (provider === 'gemini') {
      const keyToTest = (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : aiCfg.geminiApiKey;
      const modelToTest = (typeof model === 'string' && model.trim()) ? model.trim() : aiCfg.geminiModel;

      const result = await testGeminiConnection(keyToTest, modelToTest);
      return res.json(result);
    }

    if (provider === 'miniroot') {
      const result = await testMiniRootConnection(baseUrl, apiKey, model);
      return res.json(result);
    }

    return res.status(400).json({
      success: false,
      message: `Provedor ${provider} não suporta teste automático de conexão.`,
    });
  } catch (err) {
    next(err);
  }
}

async function attachMessages(conversations) {
  if (conversations.length === 0) return conversations;
  const ids = conversations.map((c) => c.id);

  const msgsRes = await query(
    `SELECT id, conversation_id, role, content, created_at
     FROM ai_mentor_message
     WHERE conversation_id = ANY($1)
     ORDER BY created_at ASC`,
    [ids]
  );

  const map = new Map();
  for (const m of msgsRes.rows) {
    if (!map.has(m.conversation_id)) map.set(m.conversation_id, []);
    map.get(m.conversation_id).push({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    });
  }

  return conversations.map((c) => ({
    ...c,
    messages: map.get(c.id) || [],
  }));
}

export async function listConversations(req, res, next) {
  try {
    const result = await query(
      `SELECT id, title, provider, created_at, updated_at
       FROM ai_mentor_conversation
       WHERE owner_id = $1
       ORDER BY updated_at DESC`,
      [req.user.id]
    );

    const enriched = await attachMessages(result.rows);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function createConversation(req, res, next) {
  try {
    if (!['student', 'teacher', 'administrator'].includes(req.user.role)) {
      throw new PermissionError('A IA Mentora está disponível para usuários cadastrados.');
    }

    const { provider } = req.body;
    const providers = await availableProviders();

    if (!provider || !providers[provider]) {
      throw new ValidationError('Este provedor ainda não está configurado no backend.', {
        provider: ['Este provedor ainda não está configurado no backend.'],
      });
    }

    if (provider === 'ollama' && !isLocalOllama()) {
      throw new ValidationError('O Ollama deve apontar para um endereço local para proteger a conversa.', {
        provider: ['O Ollama deve apontar para um endereço local para proteger a conversa.'],
      });
    }

    const now = new Date();
    const insertRes = await query(
      `INSERT INTO ai_mentor_conversation (owner_id, title, provider, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, title, provider, created_at, updated_at`,
      [req.user.id, 'Nova conversa', provider, now]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      messages: [],
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM ai_mentor_conversation WHERE id = $1', [id]);
    const conversation = existing.rows[0];
    if (!conversation) throw new NotFoundError('Conversa não encontrada.');

    if (req.user.role !== 'administrator' && conversation.owner_id !== req.user.id) {
      throw new NotFoundError('Conversa não encontrada.');
    }

    await query('DELETE FROM ai_mentor_conversation WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function chatInConversation(req, res, next) {
  try {
    if (!['student', 'teacher', 'administrator'].includes(req.user.role)) {
      throw new PermissionError('A IA Mentora está disponível para usuários cadastrados.');
    }

    const id = parseInt(req.params.id, 10);
    const cRes = await query('SELECT id, title, provider, owner_id FROM ai_mentor_conversation WHERE id = $1', [id]);
    const conversation = cRes.rows[0];
    if (!conversation || conversation.owner_id !== req.user.id) {
      throw new NotFoundError('Conversa não encontrada.');
    }

    const { content, external_data_consent } = req.body;
    if (!content || typeof content !== 'string' || !content.trim() || content.length > 6000) {
      throw new ValidationError('A mensagem deve ter entre 1 e 6000 caracteres.', {
        content: ['A mensagem deve ter entre 1 e 6000 caracteres.'],
      });
    }

    if (['gemini', 'groq'].includes(conversation.provider) && external_data_consent !== true) {
      throw new ValidationError('Confirme que entende que a mensagem será enviada ao provedor externo.', {
        external_data_consent: ['Confirme que entende que a mensagem será enviada ao provedor externo.'],
      });
    }

    const historyRes = await query(
      `SELECT role, content
       FROM ai_mentor_message
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [conversation.id]
    );

    const history = historyRes.rows.reverse();
    history.push({ role: 'user', content: content.trim() });

    const reply = await generateReply(conversation.provider, history);
    if (!reply || !reply.trim()) {
      throw new ValidationError('O provedor retornou uma resposta vazia.');
    }

    const now = new Date();
    const result = await withTransaction(async (client) => {
      const userMsgRes = await client.query(
        `INSERT INTO ai_mentor_message (conversation_id, role, content, created_at)
         VALUES ($1, 'user', $2, $3)
         RETURNING id, role, content, created_at`,
        [conversation.id, content.trim(), now]
      );

      const assistantMsgRes = await client.query(
        `INSERT INTO ai_mentor_message (conversation_id, role, content, created_at)
         VALUES ($1, 'assistant', $2, $3)
         RETURNING id, role, content, created_at`,
        [conversation.id, reply.slice(0, 6000), new Date(now.getTime() + 10)]
      );

      const newTitle = content.trim().slice(0, 140);
      const updatedConvRes = await client.query(
        `UPDATE ai_mentor_conversation
         SET title = $1, updated_at = $2
         WHERE id = $3
         RETURNING id, title, provider, created_at, updated_at`,
        [newTitle, now, conversation.id]
      );

      return {
        conversation: updatedConvRes.rows[0],
        messages: [userMsgRes.rows[0], assistantMsgRes.rows[0]],
      };
    });

    const [enrichedConv] = await attachMessages([result.conversation]);

    res.status(201).json({
      conversation: enrichedConv,
      messages: result.messages,
    });
  } catch (err) {
    next(err);
  }
}
