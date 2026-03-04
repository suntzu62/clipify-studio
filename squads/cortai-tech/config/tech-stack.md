# CortAI Tech Stack

## Backend (clipify-studio/backend-v2/)
- **Runtime:** Node.js 20.x ESM + TypeScript strict
- **Framework:** Fastify 4.26 + plugins (cors, cookie, multipart, websocket)
- **Queue:** BullMQ 5.x + Redis 7 (ioredis 5.x) — workers em `src/jobs/`
- **Database:** PostgreSQL 15 via `pg` (SQL puro, sem ORM)
- **AI:** openai ^4.x (Whisper + GPT-4), @anthropic-ai/sdk ^0.68, @google/generative-ai
- **Video:** fluent-ffmpeg + ffmpeg-static, yt-dlp-wrap, @distube/ytdl-core
- **ML:** @vladmandic/face-api + @tensorflow/tfjs-node (face detection)
- **Storage:** @supabase/supabase-js (storage only, não auth)
- **Auth:** jsonwebtoken + bcryptjs + httpOnly cookies
- **Payments:** mercadopago ^2.x (Brasil)
- **Testing:** Vitest + vitest/coverage-v8
- **Error monitoring:** Sentry

## Frontend (clipify-studio/src/)
- **Framework:** React 18 + Vite 5 + TypeScript
- **UI:** Radix UI + Tailwind CSS + shadcn/ui + Framer Motion
- **Data:** TanStack Query v5 + React Context
- **Auth:** Clerk (@clerk/clerk-react)
- **Analytics:** PostHog + Sentry
- **Router:** React Router v6
- **Forms:** React Hook Form + Zod

## Mobile (clipify-mobile/)
- **Framework:** React Native 0.81 + Expo SDK 54
- **Navigation:** Expo Router v6
- **Styling:** NativeWind 4 + Tailwind CSS 4
- **State:** Zustand + TanStack Query v5
- **Media:** expo-av, expo-video-thumbnails, expo-image-picker

## Infraestrutura
- **Local:** Docker Compose (`docker-compose.yml`)
  - postgres:15-alpine porta 5432
  - redis:7-alpine porta 6379
  - backend porta 3000
  - frontend porta 8080
  - pgAdmin porta 5050
- **Produção:** Render.com
  - `main` branch → produção
  - `staging` branch → staging
  - Services: web (frontend), api (backend), worker (BullMQ), keyvalue (Redis)
- **Submodule:** `clipify-studio/` → github.com/suntzu62/clipify-studio
