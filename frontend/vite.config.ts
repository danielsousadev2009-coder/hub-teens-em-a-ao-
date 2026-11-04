import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function pagesSecurityHeaders(apiBaseUrl: string, production: boolean): Plugin {
  let apiOrigin = ''
  if (production && apiBaseUrl) {
    let apiUrl: URL
    try {
      apiUrl = new URL(apiBaseUrl)
    } catch {
      throw new Error('VITE_API_BASE_URL must be an absolute HTTPS URL for production.')
    }
    if (
      apiUrl.protocol !== 'https:' ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.pathname !== '/' ||
      apiUrl.search ||
      apiUrl.hash
    ) {
      throw new Error('VITE_API_BASE_URL must be an HTTPS origin without credentials or a path.')
    }
    apiOrigin = apiUrl.origin
  }

  return {
    name: 'cloudflare-pages-security-headers',
    apply: 'build',
    generateBundle() {
      const connectSources = ["'self'", ...(apiOrigin ? [apiOrigin] : [])].join(' ')
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          '/*',
          '  X-Content-Type-Options: nosniff',
          '  X-Frame-Options: DENY',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
          `  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.supabase.co; connect-src ${connectSources}; upgrade-insecure-requests`,
          '',
        ].join('\n'),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget =
    process.env.VITE_API_PROXY_TARGET ||
    env.VITE_API_PROXY_TARGET ||
    'http://127.0.0.1:8011'
  const apiBaseUrl = process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || ''

  return {
    plugins: [react(), tailwindcss(), pagesSecurityHeaders(apiBaseUrl, mode === 'production')],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
