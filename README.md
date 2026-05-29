# Experiential Learning Platform

The **Experiential Learning Platform** is an extracurricular learning activity system for Hong Kong primary students. It helps students plan and record field trips, lets teachers review and give feedback, visualizes activities on a map, and includes an AI learning assistant (EduBot).

## Features

| Role | Capabilities |
|------|--------------|
| **Student** | Kanban activity board, drag-and-drop cards, activity details (title, description, date, location, images), map view, AI assistant |
| **Teacher** | View assigned students' activities, card feedback, edit student profiles, cross-student summaries (AI), switch students on the map |
| **Admin** | Sign in (seed account) |

### Main modules

- **Activity Board** — Customizable columns, drag-and-drop Kanban board
- **Activity Map** — Leaflet map with activity locations (Google Geocoding)
- **AI Chatbot (EduBot)** — DeepSeek API with role-based board context and persistent chat history
- **Profile** — Student/teacher profile and password management

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│   Express   │────▶│   MySQL 8   │
│  (port 3000)│     │  (port 4000)│     │  (port 3306)│
└─────────────┘     └─────────────┘     └─────────────┘
       │                    │
       │                    ├── Google Places / Geocoding
       │                    └── DeepSeek Chat API
       └── Docker Compose (local development)
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, @hello-pangea/dnd, Leaflet |
| Backend | Node.js 20, Express, JWT, bcryptjs, multer, mysql2 |
| Database | MySQL 8.0 |
| AI | DeepSeek API |
| Maps | Google Maps Platform (Places Autocomplete + Geocoding) |

## Project structure

```
experiential-learning-platform/
├── frontend/           # Next.js frontend
├── backend/            # Express API
│   ├── src/
│   │   ├── index.js    # API routes & AI chat
│   │   ├── db.js       # Schema, migrations, seed data
│   │   ├── auth.js     # JWT middleware
│   │   └── board-service.js
│   └── uploads/        # Uploaded images (local storage, not in Git)
├── docker-compose.yml
├── .env.example        # Environment template (committed to Git)
├── .env                # Local config (not committed — create yourself)
└── db_data/            # MySQL data volume (not committed — created on first run)
```

## Quick start (Docker Compose)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Google Maps API key (Places + Geocoding, Hong Kong region) — map and location search
- DeepSeek API key — AI Chat

> **Runs without API keys:** Login, Activity Board, and card editing still work. Map geocoding and AI Chat require the corresponding keys.

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd experiential-learning-platform
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your API keys at minimum:

```env
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

For a custom domain (e.g. via `/etc/hosts`), use your actual hostnames:

```env
FRONTEND_URL=http://elp.example.com:3000
BACKEND_URL=http://elp-api.example.com:4000
```

### 3. Start services

**Local development** (hot reload, Next.js dev indicator visible):

```bash
docker compose up -d --build
```

**Production** (optimized build, no Next.js debug UI — use on EC2):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

On first run, this will automatically:

- Wait for MySQL to be healthy before starting the API
- Install frontend/backend dependencies (`npm install`)
- Create the MySQL database and tables
- Seed demo users and activity board data

> First startup can take 1–2 minutes while MySQL initializes and the frontend production build completes.

### 4. Open the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Health check | http://localhost:4000/health |

### 5. Stop and reset

```bash
# Stop containers
docker compose down

# Reset database (delete db_data/ — next start will re-seed)
docker compose down
rm -rf db_data
docker compose up -d --build
```

## Demo accounts

All seed accounts use password **`password123`**.

| Role | Email | Name |
|------|-------|------|
| Student | `student@edulearn.com` | Alex Johnson |
| Teacher | `teacher@edulearn.com` | Dr. Sarah Williams |
| Admin | `admin@edulearn.com` | Michael Chen |
| Student | `student1@edulearn.com` | Emma Davis |
| Student | `student2@edulearn.com` | James Wilson |
| Student | `student3@edulearn.com` | Olivia Brown |
| Student | `student4@edulearn.com` | Noah Taylor |
| Student | `student5@edulearn.com` | Sophia Martin |

The teacher account can view boards and profiles for `student1`–`student5`.

## Environment variables

See [`.env.example`](.env.example) for the full template.

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTEND_URL` | Yes | Public frontend URL (CORS & Next.js config) |
| `BACKEND_URL` | Yes | Public backend URL (frontend API target) |
| `GOOGLE_MAPS_API_KEY` | For maps | Location suggestions & geocoding |
| `DEEPSEEK_API_KEY` | For AI | AI Chatbot |
| `DEEPSEEK_MODEL` | No | Default: `deepseek-chat` |
| `DEEPSEEK_BASE_URL` | No | Default: `https://api.deepseek.com` |
| `JWT_SECRET` | No | JWT signing secret; default `dev-secret` (change in production) |

Docker Compose injects database settings (`DATABASE_HOST=db`, etc.). You do not need `DATABASE_*` in `.env` when using Docker.

### Docker Compose files

| File | Use case |
|------|----------|
| `docker-compose.yml` | Local dev (`npm run dev`) |
| `docker-compose.prod.yml` | Production / EC2 (`npm run build` + `npm start`) |

MySQL is not exposed on port 3306 to the host (API connects via the Docker network `db`).

## Local development (without Docker)

Requires Node.js 20+ and MySQL 8 installed locally.

```bash
# 1. Copy and configure env (include DATABASE_* — see .env.example comments)
cp .env.example .env

# 2. Backend
cd backend && npm install
export $(grep -v '^#' ../.env | xargs)   # macOS / Linux
npm run dev

# 3. Frontend (new terminal)
cd frontend && npm install
export NEXT_PUBLIC_API_URL=http://localhost:4000
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
npm run dev
```

> Docker Compose runs in **dev mode** (`npm run dev`), which is suitable for local development. Production deployment requires separate build and process manager setup.

## API overview

All `/api/*` routes except login require JWT: `Authorization: Bearer <token>`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/profile` | Get profile |
| PATCH | `/api/profile` | Update profile |
| PATCH | `/api/profile/password` | Change password |
| GET | `/api/students` | List students (teacher) |
| GET/PATCH | `/api/students/:id/profile` | Student profile (teacher) |
| GET | `/api/board/:studentId` | Get board |
| POST/PATCH/DELETE | `/api/columns` | Column CRUD |
| POST/PATCH/DELETE | `/api/cards` | Card CRUD |
| PATCH | `/api/cards/:id/feedback` | Teacher feedback |
| GET | `/api/locations/suggest` | Location autocomplete |
| POST | `/api/locations/geocode` | Batch geocoding |
| POST | `/api/uploads` | Upload image |
| POST | `/api/ai/chat` | AI chat |
| GET | `/api/ai/chat/history` | AI chat history |

## Graph Database Modeling


| Type | Examples | Role |
|------|----------|------|
| **Nodes** | `Student`, `Teacher`, `Activity`, `Location`, `Skill`, `School`, `Class`, `WorkflowStage`, `Media` | Entities with properties (`name`, `email`, `activityDate`, `lat`/`lng`, `feedbackText`, …) |
| **Relationships** | `PARTICIPATED_IN`, `LOCATED_AT`, `DEVELOPS`, `ADVISES`, `AT_STAGE`, `GAVE_FEEDBACK`, `ENROLLED_IN` | **Context** between entities—paths you traverse to answer insight questions |

**Nodes** = things you point at. **Relationships** = how they connect (often verbs). Shared dimensions (`Location`, `Skill`, `Class`) become nodes so many students and activities link to the same context.



## Git & ignored files

The root [`.gitignore`](.gitignore) excludes:

| Path | Reason |
|------|--------|
| `.env` | Contains API keys — do not commit |
| `.env.example` | **Committed** — template for others |
| `db_data/` | Local MySQL data |
| `node_modules/` | Dependencies — installed after clone |
| `backend/uploads/*` | User-uploaded images |
| `frontend/.next/` | Next.js build cache |
| `backup/` | Local backups |

## FAQ

**Q: Can I run the app right after cloning?**  
A: Yes. Run `cp .env.example .env`, add your API keys, then `docker compose up -d --build`.

**Q: API returns 502 right after first `docker compose up`?**  
A: MySQL may still be starting. Wait ~30s and run `docker compose restart backend`, or pull the latest compose files with DB healthchecks.

**Q: Next.js debug button in the corner after deploy?**  
A: You are running dev mode. Use `docker compose -f docker-compose.prod.yml up -d --build` instead.

**Q: `next build` fails with `Cannot find module '@tailwindcss/postcss'`?**  
A: Pull the latest code (Tailwind build packages are in `dependencies`), then `docker compose -f docker-compose.prod.yml up -d --build nextjs`.

**Q: AI Chat shows "DEEPSEEK_API_KEY is not configured"**  
A: Set the key in `.env` and restart the backend: `docker compose restart backend`

**Q: No map markers or geocoding fails**  
A: Enable Places and Geocoding APIs on Google Maps, and ensure the key works for Hong Kong

**Q: Backend code changes don't apply**  
A: Backend uses `node --watch` and should hot-reload via Docker volumes. If not: `docker compose restart backend`

**Q: Frontend UI doesn't update**  
A: Run `docker compose restart nextjs`
