# HUB TEENS EM AÇÃO

Plataforma educacional para ideias, desafios, projetos e colaboração estudantil. O projeto conta com frontend em React e backend em Node.js com Express e PostgreSQL (hospedado no Supabase), com autorização estrita por perfis e preparado para publicação na Vercel.

## Tecnologias

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router e Lucide React.
- **Backend:** Node.js, Express.js, JavaScript, PostgreSQL (via Supabase) e autenticação JWT em cookies `HttpOnly` com proteção CSRF.
- **Banco de dados:** PostgreSQL hospedado no Supabase (com suporte a conexões diretas ou poolers IPv4).
- **Hospedagem & Deploy:** Vercel (Frontend servido como SPA estático e API servida como Serverless Function).

## Pré-requisitos

- Node.js 20.19+ (ou 22.x / 24.x) e npm.
- Projeto Supabase existente com acesso ao banco PostgreSQL.

Não é necessário ter Python ou Django instalados.

## Configuração do Supabase e Ambiente

1. No Supabase Dashboard, abra o projeto existente e selecione **Connect**. Copie as credenciais de conexão do PostgreSQL (host, porta, database e user).

2. Crie o arquivo `backend/.env` a partir de `backend/.env.example`:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

3. Preencha as credenciais no arquivo `backend/.env`:
   - `DATABASE_URL` (ou `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
   - `JWT_SECRET` (chave de pelo menos 32 caracteres)
   - `DB_SSLMODE=require`
   - `DB_POOLER_TRANSACTION=true` (recomendado para ambientes serverless)
   - Credenciais opcionais: SMTP para recuperação de senha, Supabase Storage para imagens e chaves de IA (Gemini/Groq/Ollama).

## Instalação e Execução Local

### 1. Instalar Dependências

Na raiz do projeto:

```powershell
# Instala dependências do backend
cd backend
npm install

# Instala dependências do frontend
cd ..\frontend
npm install

cd ..
```

### 2. Executar o Backend (Terminal 1)

```powershell
npm run dev:backend
# O servidor iniciará em http://127.0.0.1:8011
```

Endpoints de verificação:
- `GET http://127.0.0.1:8011/api/health/`: retorna `{"status":"ok","service":"hub-teens-api"}`.
- `GET http://127.0.0.1:8011/api/health/ready/`: valida a conexão com o PostgreSQL do Supabase.

### 3. Executar o Frontend (Terminal 2)

```powershell
npm run dev:frontend
# O Vite iniciará em http://localhost:5173 e encaminhará requisições de /api para http://127.0.0.1:8011
```

## Testes e Verificação

Para executar a suíte de testes automatizados do backend:

```powershell
npm test
```

Para verificar o build de produção do frontend:

```powershell
npm run build
```

## Módulos e Endpoints da API

Todos os endpoints abaixo exigem autenticação via cookie `hub_access`, exceto o health-check e rotas públicas de login/CSRF:

| Domínio | Endpoints principais | Escopo |
|---|---|---|
| Saúde | `GET /api/health/`, `GET /api/health/ready/` | Verificação de disponibilidade e conexão DB |
| Autenticação | `/api/auth/csrf/`, `/api/auth/login/`, `/api/auth/logout/`, `/api/auth/refresh/`, `/api/auth/me/`, `/api/auth/password-reset/` | Sessão segura em cookies HttpOnly e CSRF |
| Painel | `GET /api/dashboard/` | Resumos e conquistas calculados a partir dos dados do usuário |
| ODS | `GET /api/ods/` | Catálogo dos 17 Objetivos de Desenvolvimento Sustentável |
| Ideias | `/api/ideas/`, `/api/ideas/categories/`, `/api/ideas/{id}/comments/` | Publicação estudantil e moderação |
| Desafios | `/api/challenges/`, `/api/challenge-submissions/` | Desafios de professores, entregas e notas |
| Equipes | `/api/teams/`, `/api/team-invitations/` | Criação de equipes, convites e gestão de membros |
| Espaço Maker | `/api/projects/`, `/api/project-steps/` | Projetos estudantis, materiais e etapas |
| Mídia Jovem | `/api/youth-media/` | Matérias estudantis sujeitas a moderação |
| Feiras | `/api/fairs/`, `/api/fair-entries/` | Feiras de ciências e inscrições de projetos |
| Agenda | `/api/events/`, `/api/event-registrations/` | Eventos escolares e inscrições de alunos |
| Notificações | `/api/notifications/` | Notificações privadas, contagem de não lidas e marcação de leitura |
| Pontos e Ranking | `GET /api/ranking/`, `GET /api/points/me/` | Histórico e pontuação individual; ranking para professores/administradores |
| IA Mentora | `/api/mentor/providers/`, `/api/mentor/conversations/` | Assistente educativa com Google Gemini, Groq ou Ollama |

## Publicação na Vercel

O projeto está configurado para deploy unificado na Vercel a partir do repositório:

1. No Vercel Dashboard, crie um novo projeto conectado ao repositório Git.
2. Deixe o **Root Directory** como a raiz do repositório (`./`) ou utilize as configurações automáticas detectadas a partir de `vercel.json`.
3. Configure as **Environment Variables** no painel da Vercel:
   - `DATABASE_URL` (ou `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
   - `DB_SSLMODE=require`
   - `DB_POOLER_TRANSACTION=true`
   - `JWT_SECRET` (chave de pelo menos 32 caracteres)
   - `CORS_ALLOWED_ORIGINS` e `CSRF_TRUSTED_ORIGINS` (URL de produção da sua Vercel, ex: `https://hub-teens.vercel.app`)
   - `FRONTEND_BASE_URL` (mesma URL da Vercel)
   - Variáveis opcionais de SMTP, Supabase Storage e IA.
4. Execute o Deploy. A Vercel servirá os arquivos estáticos do React em `/` e executará o Express como Serverless Function em `/api/*`.
