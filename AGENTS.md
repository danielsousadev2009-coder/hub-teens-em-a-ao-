# HUB TEENS EM AÇÃO — orientações para agentes

## Escopo
- Consulte o README e a fase autorizada antes de alterar o projeto.
- Implemente somente o escopo autorizado; não avance para fases futuras sem aprovação.
- Não trate dados demonstrativos como dados reais nem apresente módulos incompletos como prontos.
- Preserve a identidade visual do protótipo, priorizando acessibilidade e telas móveis.

## Estrutura
- `frontend/`: React, TypeScript, Vite, Tailwind CSS e React Router.
- `backend/`: Node.js, Express, JavaScript, PostgreSQL (Supabase) e JWT em cookies `HttpOnly`.
- `api/`: Função serverless Node.js integrada para deploy na Vercel.
- PostgreSQL (Supabase) é o banco de dados da aplicação. Credenciais ficam apenas em arquivos `.env` locais, nunca no código ou em commits.

## Qualidade
- Frontend: `npm run build` (ou `npm --prefix frontend run build`).
- Backend: `npm test` (ou `npm --prefix backend run test`).
- Mantenha autorização no backend; ocultar controles no frontend não protege endpoints.
- Atualize a documentação quando mudar os comandos de instalação ou execução.
