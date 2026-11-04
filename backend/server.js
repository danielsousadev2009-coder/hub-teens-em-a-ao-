import app from './src/app.js';
import { config } from './src/config/env.js';

const port = config.port || 8011;

app.listen(port, () => {
  console.log(`[HUB TEENS API] Servidor Node.js rodando na porta ${port} (${config.env})`);
  console.log(`[HUB TEENS API] Health check disponível em: http://127.0.0.1:${port}/api/health/`);
});

