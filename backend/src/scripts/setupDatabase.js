import pg from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const schemaSql = `
-- Accounts
CREATE TABLE IF NOT EXISTS accounts_user (
  id BIGSERIAL PRIMARY KEY,
  password VARCHAR(128) NOT NULL,
  last_login TIMESTAMPTZ,
  is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
  username VARCHAR(150) UNIQUE NOT NULL,
  first_name VARCHAR(150) DEFAULT '' NOT NULL,
  last_name VARCHAR(150) DEFAULT '' NOT NULL,
  email VARCHAR(254) DEFAULT '' NOT NULL,
  is_staff BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  date_joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  role VARCHAR(20) DEFAULT 'student' NOT NULL
);

-- ODS
CREATE TABLE IF NOT EXISTS ods_sustainablegoal (
  id BIGSERIAL PRIMARY KEY,
  number SMALLINT UNIQUE NOT NULL,
  title VARCHAR(180) NOT NULL,
  official_url VARCHAR(200) NOT NULL
);

-- Ideas
CREATE TABLE IF NOT EXISTS ideas_ideacategory (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  description VARCHAR(300) DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas_idea (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'published' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  category_id BIGINT REFERENCES ideas_ideacategory(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ideas_idea_goals (
  id BIGSERIAL PRIMARY KEY,
  idea_id BIGINT REFERENCES ideas_idea(id) ON DELETE CASCADE NOT NULL,
  sustainablegoal_id BIGINT REFERENCES ods_sustainablegoal(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(idea_id, sustainablegoal_id)
);

CREATE TABLE IF NOT EXISTS ideas_ideacomment (
  id BIGSERIAL PRIMARY KEY,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  author_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  idea_id BIGINT REFERENCES ideas_idea(id) ON DELETE CASCADE NOT NULL
);

-- Challenges
CREATE TABLE IF NOT EXISTS challenges_challenge (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  rules TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  goal_id BIGINT REFERENCES ods_sustainablegoal(id) ON DELETE SET NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE RESTRICT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges_challengesubmission (
  id BIGSERIAL PRIMARY KEY,
  response TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'submitted' NOT NULL,
  feedback TEXT DEFAULT '' NOT NULL,
  score SMALLINT,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  reviewed_at TIMESTAMPTZ,
  challenge_id BIGINT REFERENCES challenges_challenge(id) ON DELETE CASCADE NOT NULL,
  student_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(challenge_id, student_id)
);

-- Teams
CREATE TABLE IF NOT EXISTS teams_team (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(1000) DEFAULT '' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL
);

CREATE TABLE IF NOT EXISTS teams_teammembership (
  id BIGSERIAL PRIMARY KEY,
  status VARCHAR(12) DEFAULT 'invited' NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  team_id BIGINT REFERENCES teams_team(id) ON DELETE CASCADE NOT NULL,
  user_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(team_id, user_id)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects_project (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  materials TEXT DEFAULT '' NOT NULL,
  image VARCHAR(255) DEFAULT '' NOT NULL,
  status VARCHAR(12) DEFAULT 'published' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  team_id BIGINT REFERENCES teams_team(id) ON DELETE SET NULL,
  challenge_id BIGINT REFERENCES challenges_challenge(id) ON DELETE SET NULL,
  idea_id BIGINT REFERENCES ideas_idea(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_project_goals (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects_project(id) ON DELETE CASCADE NOT NULL,
  sustainablegoal_id BIGINT REFERENCES ods_sustainablegoal(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(project_id, sustainablegoal_id)
);

CREATE TABLE IF NOT EXISTS projects_projectstep (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  position SMALLINT DEFAULT 0 NOT NULL,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  project_id BIGINT REFERENCES projects_project(id) ON DELETE CASCADE NOT NULL
);

-- Media
CREATE TABLE IF NOT EXISTS media_youtharticle (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(60) DEFAULT '' NOT NULL,
  image VARCHAR(255) DEFAULT '' NOT NULL,
  status VARCHAR(12) DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  moderated_at TIMESTAMPTZ,
  author_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL
);

-- Fairs
CREATE TABLE IF NOT EXISTS fairs_projectfair (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN DEFAULT FALSE NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE RESTRICT NOT NULL
);

CREATE TABLE IF NOT EXISTS fairs_projectfairentry (
  id BIGSERIAL PRIMARY KEY,
  status VARCHAR(12) DEFAULT 'registered' NOT NULL,
  feedback TEXT DEFAULT '' NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  fair_id BIGINT REFERENCES fairs_projectfair(id) ON DELETE CASCADE NOT NULL,
  project_id BIGINT REFERENCES projects_project(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(fair_id, project_id)
);

-- Events
CREATE TABLE IF NOT EXISTS events_event (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(180) DEFAULT '' NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN DEFAULT FALSE NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE RESTRICT NOT NULL
);

CREATE TABLE IF NOT EXISTS events_eventregistration (
  id BIGSERIAL PRIMARY KEY,
  registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  event_id BIGINT REFERENCES events_event(id) ON DELETE CASCADE NOT NULL,
  student_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(event_id, student_id)
);

-- Ranking & Gamification
CREATE TABLE IF NOT EXISTS ranking_pointaward (
  id BIGSERIAL PRIMARY KEY,
  points SMALLINT NOT NULL,
  reason VARCHAR(200) NOT NULL,
  source_key VARCHAR(120) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  user_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications_notification (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(140) NOT NULL,
  message VARCHAR(500) NOT NULL,
  url VARCHAR(200) DEFAULT '' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  read_at TIMESTAMPTZ,
  recipient_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL
);

-- AI Mentor
CREATE TABLE IF NOT EXISTS ai_mentor_conversation (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(140) DEFAULT 'Nova conversa' NOT NULL,
  provider VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  owner_id BIGINT REFERENCES accounts_user(id) ON DELETE CASCADE NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_mentor_message (
  id BIGSERIAL PRIMARY KEY,
  role VARCHAR(12) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  conversation_id BIGINT REFERENCES ai_mentor_conversation(id) ON DELETE CASCADE NOT NULL
);
`;

const ODS_GOALS = [
  "Erradicação da pobreza",
  "Fome zero e agricultura sustentável",
  "Saúde e bem-estar",
  "Educação de qualidade",
  "Igualdade de gênero",
  "Água potável e saneamento",
  "Energia limpa e acessível",
  "Trabalho decente e crescimento econômico",
  "Indústria, inovação e infraestrutura",
  "Redução das desigualdades",
  "Cidades e comunidades sustentáveis",
  "Consumo e produção responsáveis",
  "Ação contra a mudança global do clima",
  "Vida na água",
  "Vida terrestre",
  "Paz, justiça e instituições eficazes",
  "Parcerias e meios de implementação",
];

async function main() {
  console.log('1. Connecting to PostgreSQL...');
  await pool.query('SELECT 1');
  console.log('   Connection established.');

  console.log('2. Creating tables...');
  await pool.query(schemaSql);
  console.log('   All tables created successfully.');

  console.log('3. Seeding ODS goals...');
  for (let i = 0; i < ODS_GOALS.length; i++) {
    const number = i + 1;
    const title = ODS_GOALS[i];
    const url = `https://brasil.un.org/pt-br/sdgs/${number}`;
    await pool.query(
      `INSERT INTO ods_sustainablegoal (number, title, official_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (number) DO UPDATE SET title = EXCLUDED.title, official_url = EXCLUDED.official_url`,
      [number, title, url]
    );
  }
  console.log('   17 ODS goals seeded.');

  console.log('Database initialization completed successfully!');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
