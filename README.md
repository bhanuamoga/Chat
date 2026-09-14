# Morr Chat

A production-ready, WhatsApp-style realtime chat and AI analytics workspace built with **Next.js 16 (App Router)**, **Drizzle ORM + PostgreSQL**, **NextAuth (Auth.js v5)** sessions, **Supabase Realtime**, and **Google Gemini 2.5 Flash** (via Vercel AI SDK).

---

## ✨ Structure at a glance

Three dedicated pages accessible from the left navigation rail:

| Route      | Page          | Description |
|------------|---------------|---------------------------------------------------------|
| `/chat`    | **Chat**      | 1:1 Direct Messages (`type = 'dm'`)                    |
| `/groups`  | **Group Chat**| Group Discussions (`type = 'group'`)                    |
| `/natural` | **Natural Chat** | AI Workspace powered by **Gemini 2.5 Flash** with **visual analytics** (charts, tables, KPI metric cards) & token usage telemetry |
| `/`        | **Sign In**   | Credentials authentication (redirects to `/chat` if logged in) |

---

## 🤖 Natural Chat (Gemini 2.5 Flash AI + Visual Analytics)

- **AI Engine**: Google Gemini 2.5 Flash accessed via Vercel AI SDK (`ai` & `@ai-sdk/google`).
- **Visual Analytics**: When users ask for data, financial trends, KPI summaries, comparisons, or performance analytics, Natural Chat dynamically renders:
  1. **Summary Badges** (headline insight).
  2. **KPI Metric Cards** with positive/negative trend indicators (`+14%`, `▲`, `▼`).
  3. **Interactive Charts** (Recharts Bar, Line, Area charts).
  4. **Structured Tables** with headers and columns.
  5. **Token Telemetry**: Tracks prompt tokens, completion tokens, and total tokens per message and cumulative tokens per chat session.

---

## 🗄️ Database Tables (Supabase PostgreSQL + Drizzle ORM)

- `users` — User profiles, credentials, avatar URL/emoji, presence (`last_seen`).
- `conversations` — Direct (`dm`) and group (`group`) threads.
- `conversation_participants` — Membership join table with unread badges.
- `messages` — Chat messages with attachments, replies, edits, deletions.
- `message_reactions` — Realtime emoji reactions (`👍 ❤️ 😂 😮 😢 🙏 👎`).
- `natural_chats` — Dedicated AI conversation threads with accumulated token telemetry.
- `natural_messages` — AI message history, prompt/completion token counters, and `visual_data` JSONB payload.

---

## ⚙️ Environment Variables

Add these to your **Vercel Project Settings → Environment Variables** or local `.env`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string (Supabase transaction pooler port `6543`) |
| `AUTH_SECRET` | ✅ Yes | Random 32+ character string for NextAuth JWT encryption |
| `NEXTAUTH_SECRET` | ✅ Yes | Same value as `AUTH_SECRET` |
| `GEMINI_API_KEY` | ✅ For AI | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase Project URL (`https://<project-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase public `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase `service_role` secret (server-side only) |

---

## 🚀 Getting Started

```bash
npm install

# 1. Configure environment
cp .env.example .env
# Fill DATABASE_URL, AUTH_SECRET, and GEMINI_API_KEY

# 2. Push schema to PostgreSQL (Supabase)
npx drizzle-kit push

# 3. Run development server
npm run dev

# 4. Or build for production
npm run build && npm run start
```
