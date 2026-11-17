import app from './src/app.js';
import { config } from './src/config/env.js';
import { initAiSettings } from './src/utils/aiProviders.js';

const port = config.port || 8011;

initAiSettings().catch((err) => console.error('[AI] Error initializing AI settings:', err.message));

app.listen(port, () => {
  console.log(`[HUB TEENS API] Servidor Node.js rodando na porta ${port} (${config.env})`);
  console.log(`[HUB TEENS API] Health check disponível em: http://127.0.0.1:${port}/api/health/`);
});
