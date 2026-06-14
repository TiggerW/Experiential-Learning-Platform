# Skyline — Experiential Learning Platform

**Skyline** is an extracurricular experiential learning system for Hong Kong primary students. Students record field trips on a Kanban board; teachers review progress, link curriculum objectives, confirm skills, and use **Graph RAG AI** (Neo4j + DeepSeek) for grounded assistance and semi-auto content generation.

## Features

| Role | Capabilities |
|------|--------------|
| **Student** | Kanban board (Pretrip / Actual Trip / Post Trip Reflection), card details, map view, **EduBot** AI assistant |
| **Teacher** | View assigned students, card feedback, learning objectives, skill inference & confirmation, **Content Studio** (semi-auto generation), cross-student AI summaries |
| **Admin** | Sign in (seed account) |

### Main modules

| Module | Description |
|--------|-------------|
| **Activity Board** | Drag-and-drop Kanban with fixed workflow stages |
| **Activity Map** | Leaflet map with checkpoint markers (龍躍頭文物徑) |
| **EduBot** | DeepSeek chat with **Neo4j Graph RAG** + board context |
| **Content Studio** | Semi-auto reflection prompts, follow-up activities, assessments |
| **Learning Objectives** | P4 curriculum import + auto-link to activity cards |
| **Skills** | 20-skill library, rule-based inference, teacher confirm/reject |
| **Profile** | User profile and password management |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│   Express   │────▶│   MySQL 8   │
│  (port 3000)│     │  (port 4000)│     │  (internal) │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │                   ├──────────────▶ Neo4j 5 (7474 / 7687)
       │                   │                 Graph sync + Graph RAG
       │                   ├── Google Places / Geocoding
       │                   └── DeepSeek Chat API
       └── Docker Compose
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, @hello-pangea/dnd, Leaflet |
| Backend | Node.js 20, Express, JWT, bcryptjs, multer, mysql2, neo4j-driver |
| Databases | MySQL 8.0 (operational) + **Neo4j 5** (learning graph) |
| AI | DeepSeek API (EduBot + Content Studio) |
| Maps | Google Maps Platform (Places + Geocoding) |

## Project structure

```
Skyline/
├── frontend/                 # Next.js app
├── backend/
│   └── src/
│       ├── index.js          # API routes
│       ├── db.js             # MySQL schema & seed
│       ├── graph-sync.js     # MySQL → Neo4j sync
│       ├── graph-rag.js      # Graph RAG for EduBot
│       ├── content-generator.js  # Content Studio generation
│       ├── learning-import.js    # Dataset import
│       ├── objective-matching.js # Auto-link LO
│       └── skill-inference.js    # Skill suggestions
├── learning_content_dataset/ # Student + curriculum data (local, gitignored)
├── docs/
│   ├── graph-database-proposal.md   # Task 3 schema & Cypher
│   └── graphdb-rag-ai-proposal.md   # GraphDB-RAG AI proposal
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start (Docker Compose)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Google Maps API key** (Places + Geocoding) — for map features
- **DeepSeek API key** — for EduBot and Content Studio

> Without API keys: login, board, and card editing still work. Map geocoding and AI features need the keys.

### 1. Clone and configure

```bash
git clone <your-repo-url>
cd Skyline
cp .env.example .env
```

Edit `.env`:

```env
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
NEO4J_USER=
NEO4J_PASSWORD=
```

### 2. Add learning dataset (optional but recommended)

Place the provided `learning_content_dataset/` folder at the project root (same level as `docker-compose.yml`). It is gitignored by default.

On first startup the backend automatically imports:

- 4 students' Map Location + Five Senses data → activity cards
- P4 humanities/science curriculum → `learning_objectives`
- Full **Neo4j graph resync** + objective auto-link + skill inference

### 3. Start services

```bash
docker compose up -d --build
```

First run may take 1–2 minutes (MySQL init, npm install, dataset import, graph sync).

### 4. Open the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Health check | http://localhost:4000/health |
| **Neo4j Browser** | http://localhost:7474 |

### 5. Neo4j Browser

Open http://localhost:7474 (or your Neo4j subdomain in production). Sign in with the Bolt URI and your app credentials (`NEO4J_USER`, `NEO4J_PASSWORD` from `.env`). Do not commit credentials to the repository.

> **How auth works:** Docker starts Neo4j with the built-in `neo4j` user (same `NEO4J_PASSWORD`). On backend startup, `skyline_admin` (or your `NEO4J_USER`) is created automatically if missing. Use `NEO4J_USER` for Browser and API access.

> **Security:** Use a strong, unique password before exposing Neo4j Browser on a public subdomain. Generate one with e.g. `openssl rand -base64 24`.

> **Changing credentials:** If Neo4j was previously initialized with different credentials, remove the data volume and restart: `docker compose down && docker volume rm skyline_neo4j_data` (volume name may vary — check `docker volume ls`).

See [docs/graph-database-proposal.md](docs/graph-database-proposal.md) for schema diagrams and exploration Cypher.

### 6. Stop and reset

```bash
docker compose down

# Reset MySQL data (re-seed on next start)
rm -rf db_data
docker compose up -d --build
```

Neo4j data persists in the `neo4j_data` Docker volume unless removed with `docker volume rm`.

## Demo accounts

All accounts use password **`password123`**.

| Role | Email | Name | Notes |
|------|-------|------|-------|
| Teacher | `teacher@edulearn.com` | Dr. Sarah Williams | Views student1–4 boards, Content Studio, Skills |
| Student | `student1@edulearn.com` | Chan Yuet Kwan (陳玥鈞) | Dataset import — 4B |
| Student | `student2@edulearn.com` | Chan Hon Lam (陳翰霖) | Dataset import — 4B |
| Student | `student3@edulearn.com` | Hung Hou Long (洪号朗) | Dataset import — 4B |
| Student | `student4@edulearn.com` | Wong Pak Yin (黃柏然) | Dataset import — 4B |
| Student | `student5@edulearn.com` | Sophia Martin | Demo board only — 6B |
| Student | `student@edulearn.com` | Alex Johnson | Demo board — 4A |
| Admin | `admin@edulearn.com` | Michael Chen | Admin login |

## Graph Database & Graph RAG

### What is synced to Neo4j?

| Node | Relationships |
|------|---------------|
| `Student`, `Teacher`, `Class` | `ADVISES`, `ENROLLED_IN` |
| `Activity` (board cards) | `PARTICIPATED_IN`, `AT_STAGE`, `LOCATED_AT`, `ACHIEVES`, `HAS_MEDIA` |
| `Location`, `Trip` | `VISITED`, `PART_OF` |
| `LearningObjective` | `ACHIEVES` (from card links) |
| `Skill` | `DEVELOPS`, `EVIDENCE_FOR` |
| `WorkflowStage` | `HAS_STAGE`, `AT_STAGE` |
| `Media` | `HAS_MEDIA` |

MySQL remains the source of truth; Neo4j is synced on startup and on card/skill changes.

### EduBot Graph RAG

Before each chat reply, the backend:

1. Detects question **intent** (locations, objectives, skills, reflection, …)
2. Runs **Cypher queries** against Neo4j
3. Injects subgraph results + board snapshot into the LLM prompt

**Try as teacher:**

- 「邊個學生去過天后宮？」
- 「Who has not completed reflection yet?」
- 「Compare skills across my students」

### Content Studio (semi-auto generation)

Teacher → **Content Studio** tab:

1. Select student + activity card (e.g. 天后宮)
2. Choose type: reflection / follow-up / assessment
3. **Generate** → preview items → **Apply to Activity Board**

Uses the same Graph RAG context plus curriculum objectives. See [docs/graphdb-rag-ai-proposal.md](docs/graphdb-rag-ai-proposal.md).

### View schema visually

| Method | How |
|--------|-----|
| **Neo4j Browser** | http://localhost:7474 → run `CALL apoc.meta.graph()` or subgraph MATCH queries |
| **Markdown diagrams** | [docs/graph-database-proposal.md](docs/graph-database-proposal.md) — Mermaid ER + flowchart (renders on GitHub) |
| **Cypher inventory** | `MATCH (n) RETURN labels(n)[0], count(*)` in Neo4j Browser |

## Environment variables

See [`.env.example`](.env.example).

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTEND_URL` | Yes | Public frontend URL (CORS) |
| `BACKEND_URL` | Yes | Public backend URL |
| `GOOGLE_MAPS_API_KEY` | For maps | Places + Geocoding |
| `DEEPSEEK_API_KEY` | For AI | EduBot + Content Studio |
| `NEO4J_USER` / `NEO4J_PASSWORD` | **Yes** (graph) | Neo4j credentials — set in `.env` only; never commit |
| `DEEPSEEK_MODEL` | No | Default `deepseek-chat` |
| `JWT_SECRET` | No | Default `dev-secret` |

Docker Compose injects `DATABASE_*` and `NEO4J_URI=bolt://neo4j:7687` for the backend automatically.

## API overview

All `/api/*` routes except login require JWT: `Authorization: Bearer <token>`

### Core

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/profile` | Get profile |
| GET | `/api/board/:studentId` | Get Kanban board |
| POST/PATCH/DELETE | `/api/cards` | Card CRUD |
| PATCH | `/api/cards/:id/feedback` | Teacher feedback |

### AI & Graph RAG

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/chat` | EduBot with Graph RAG |
| GET | `/api/ai/chat/history` | Chat history |
| GET | `/api/content-studio/context` | Card + LO + skill context |
| POST | `/api/ai/generate-content` | Generate reflection / follow-up / assessment |
| POST | `/api/ai/apply-generated-content` | Apply selected items to board |

### Curriculum & skills

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PATCH/DELETE | `/api/learning-objectives` | Learning objectives CRUD |
| POST | `/api/learning-objectives/import-curriculum` | Import curriculum xlsx |
| POST | `/api/cards/auto-link-objectives` | Auto-link LO to cards |
| GET/POST/PATCH/DELETE | `/api/skills` | Skill library |
| GET/POST | `/api/students/:id/skills` | Student skill records |
| POST | `/api/students/:id/skills/infer` | Re-run skill inference |
| POST | `/api/students/:id/skills/:id/confirm` | Confirm suggested skill |

## Documentation (assignment deliverables)

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Setup instructions (this file) |
| [docs/graph-database-proposal.md](docs/graph-database-proposal.md) | **Task 3** — GraphDB schema, Mermaid diagrams, Cypher examples |
| [docs/graphdb-rag-ai-proposal.md](docs/graphdb-rag-ai-proposal.md) | **GraphDB-RAG AI** — pipeline, semi-auto generation |

## Git & ignored files

| Path | Reason |
|------|--------|
| `.env` | API keys — do not commit |
| `learning_content_dataset/` | Large local dataset |
| `db_data/` | MySQL volume |
| `backend/uploads/*` | Uploaded images |
| `frontend/.next/` | Build cache |

## FAQ

**Q: Backend fails on first start?**  
A: Wait ~30s for MySQL/Neo4j healthchecks, then `docker compose restart backend`.

**Q: AI shows "DEEPSEEK_API_KEY is not configured"?**  
A: Set the key in `.env` and restart: `docker compose restart backend`.

**Q: No student dataset cards?**  
A: Ensure `learning_content_dataset/` exists at project root and restart backend.

**Q: How do I explore the graph?**  
A: Open http://localhost:7474, login, and run queries from [graph-database-proposal.md](docs/graph-database-proposal.md).

**Q: Content Studio generate fails?**  
A: Requires `DEEPSEEK_API_KEY`. Login as teacher and select a student with imported cards.

**Q: Neo4j graph empty?**  
A: Check backend logs for "Neo4j graph sync complete". Restart backend to trigger `fullGraphResync()`.
