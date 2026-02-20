# Orbit Thread — Development Log

> Everything we built, fixed, and shipped — from first commit to today.

---

## Project At a Glance

| Item | Value |
|------|-------|
| **App** | Orbit Thread — "Think Louder, Together." |
| **What it is** | Real-time social platform (Circles, DMs, Connections, Discovery) |
| **Live URL** | [orbit-thread.vercel.app](https://orbit-thread.vercel.app) |
| **Repo** | [github.com/samisback2024/Orbit-Thread](https://github.com/samisback2024/Orbit-Thread) |
| **Stack** | React 19.2 · Vite 7.3 · Supabase (PostgreSQL + Auth + Realtime) · Vercel |
| **Total source lines** | ~4,700 (excluding config/lockfiles) |
| **Bundle size** | 136 KB gzipped |
| **Commits** | 22 on `main` |
| **Date** | February 2026 |

---

## What We Built — Phase by Phase

### Phase 1 — Core Social Platform

Built the entire foundation from scratch in a single-file React architecture.

**Authentication**
- Email/password signup + login via Supabase Auth
- Auto-profile creation on signup (Postgres trigger function)
- Persistent sessions across page refreshes
- Change password from Settings
- Full sign-out with state reset

**Onboarding**
- Topic picker (choose 3–5 from 55 curated topics)
- Topics saved to user profile, skip onboarding on return visits

**Circles (Rooms)**
- Create rooms with name, purpose, visibility (public/private), member limit
- Schedule rooms with date/time, export to ICS / Google Calendar
- 5 rooms/day for free users, unlimited for Verified users
- Delete rooms (owner only), pin conclusions
- All rooms persisted in Supabase `rooms` table

**Real-Time Chat**
- Live messaging in rooms via Supabase Realtime WebSocket
- Emoji reactions, reply-to threading, auto-scroll
- Client-side profanity filter
- Messages persisted in `messages` table with author profiles

**Connection System**
- 3-state machine: NONE → PENDING_SENT → ACCEPTED
- Send, accept, decline connection requests
- In-app notification panel with action buttons
- Chat/Call locked until connection accepted

**Verified Badge**
- Monthly ($4/mo) and Annual ($30/yr) plan toggle
- Purchase persisted to `profiles` table
- Checkmark displayed on profile and sidebar

**Profile & Settings**
- Profile page: name, handle, bio, interests, rooms
- Privacy toggles: public profile, show status, allow connections, email notifs
- All settings saved to Supabase

**UI/UX**
- Warm charcoal design with terracotta accents (`#E8845A`)
- Plus Jakarta Sans + Lora typography
- Aurora background glow, animated borders, shimmer effects
- Staggered fade-up animations
- Responsive layout with sidebar collapse on mobile
- Search across rooms and people
- Notification panel with unread count

---

### Phase 2 — Discovery, DMs, Premium

**Geo-Radius Room Discovery**
- Radius selector on room creation (1 mi → Worldwide, 7 tiers)
- Haversine formula for distance calculation
- Geo badge on room cards
- "Near me" toggle on Discover tab using `navigator.geolocation`

**Public Room Discovery**
- Home tabs: "My Rooms" / "Discover"
- Discover grid with public rooms across 11 topic categories
- Join / Leave / Open actions per room
- Member count + topic badges on cards

**Direct Messaging (1:1 DMs) — Fully Persistent**
- Complete Supabase-backed DM system (not mocks)
- 3 database tables: `direct_conversations`, `direct_conversation_members`, `direct_messages`
- Row Level Security: users can only see their own conversations and messages
- Realtime WebSocket subscriptions for instant message delivery
- Optimistic UI: messages appear immediately, confirmed by server
- Deduplication: prevents double-render from optimistic + realtime
- Profanity filter on sends (client-side)
- Bubble-style chat layout with timestamps
- Conversation list sorted by most recent activity

**Image Upload in Chat**
- Paperclip button in message composer
- FileReader API for base64 preview
- 5 MB limit with error feedback
- Supports JPEG, PNG, GIF, WebP

**Premium Modal**
- Feature list display (Unlimited Rooms, Verified Badge, Priority Support)
- Plan pricing with trial activation
- Verified status persisted to Supabase

---

## Files We Created

### SQL Migrations

| File | Lines | What It Does |
|------|-------|-------------|
| `supabase/migrations/20260220000000_initial_schema.sql` | 158 | Core tables: `profiles`, `rooms`, `room_members`, `messages`, `connections`, `notifications`, `room_creations`. RLS policies, indexes, auto-profile trigger, realtime config. |
| `supabase/migrations/20260220100000_direct_messages.sql` | 154 | DM tables: `direct_conversations`, `direct_conversation_members`, `direct_messages`. RLS policies, GIN indexes, `find_dm_conversation()` dedup function, `update_conversation_timestamp()` trigger, realtime config. |

### Backend Functions

| File | Lines | What It Does |
|------|-------|-------------|
| `src/lib/dm.js` | 419 | All DM operations: `createConversation()`, `sendDirectMessage()`, `getUserConversations()`, `getConversationMessages()`, `subscribeToConversation()`, `subscribeToAllConversations()`, `editDirectMessage()`, `deleteDirectMessage()`. Graceful auth handling (returns `[]` when not logged in). |

### React Hooks

| File | Lines | What It Does |
|------|-------|-------------|
| `src/hooks/useConversations.js` | 87 | Fetches conversation list, subscribes to realtime updates across all conversations. Accepts `userId` param — skips queries when not authenticated. |
| `src/hooks/useDirectMessages.js` | 112 | Fetches messages for one conversation, realtime INSERT/UPDATE subscription, deduplication logic, optimistic message support. |
| `src/hooks/useSendDirectMessage.js` | 106 | Send function with optimistic UI, profanity filter, error handling with rollback, loading state. |

### Core App

| File | Lines | What It Does |
|------|-------|-------------|
| `src/OrbitThreadApp.jsx` | 2,760 | Entire app: CSS, constants, state, Supabase queries, all views (auth, onboard, home, room, profile, people, settings, create modal, invite modal, call modal, discover, DMs, premium modal). |
| `src/supabase.js` | 8 | Supabase client initialization with env var fallbacks. |
| `src/main.jsx` | 9 | React DOM root mount. |
| `src/index.css` | 9 | Global body/html reset. |

### Config & Deploy

| File | Purpose |
|------|---------|
| `index.html` | Entry HTML with Orbit Thread favicon + title |
| `vite.config.js` | Vite config with React plugin |
| `vercel.json` | SPA rewrite rules for Vercel deployment |
| `eslint.config.js` | ESLint config for React hooks + refresh |
| `package.json` | 3 dependencies, 5 devDependencies |
| `public/orbit-thread.svg` | Custom terracotta diamond favicon |
| `supabase/config.toml` | Supabase CLI configuration |

---

## Bugs We Found and Fixed

### 1. Blank Page on Vercel (Early Deploy)

**Problem:** App deployed to Vercel but showed a blank white page.
**Root cause:** Supabase env vars were missing on Vercel, and the client initialization failed silently.
**Fix:** Hardcoded fallback Supabase URL and anon key in `supabase.js` so the app always has valid credentials. Set proper `VITE_` prefixed env vars in Vercel dashboard.

### 2. Vercel Build Path Issues

**Problem:** Build failed — Vercel couldn't find the entry point.
**Root cause:** Project had a nested subfolder from an earlier structure. Vercel was building from the wrong root.
**Fix:** Consolidated project to root directory, removed duplicate subfolder, added explicit `vercel.json` with build command and output directory.

### 3. SQL Migration "Policy Already Exists"

**Problem:** User ran the DM migration SQL in Supabase SQL Editor, got `policy "Members can view their conversations" already exists` error.
**Root cause:** Migration was partially run before — tables created but script failed halfway, leaving some policies in place.
**Fix:** Provided a safe re-run version with `DROP POLICY IF EXISTS` statements before each `CREATE POLICY`.

### 4. App Stuck on "Loading Orbit Thread..." — Never Gets Past Splash

**Problem:** After deploying the DM system, the app showed the loading spinner indefinitely. No login screen ever appeared.

**Root cause (3 issues):**

1. **`useConversations()` fired before auth** — The hook was called unconditionally at component mount. It immediately called `getUserConversations()` → `supabase.auth.getUser()` → threw `"Not authenticated"` before the auth session was established. This crashed the initialization flow.

2. **`getUserConversations()` threw on no auth** — Instead of handling the unauthenticated case gracefully, it threw an error, which propagated up and prevented `authLoading` from being set to `false`.

3. **Broken references to removed variables** — `signOut()` called `setActiveDM(null)` and `setDmMessages({})`, and the sidebar JSX referenced `Object.values(dmMessages)` — all variables that were removed during the DM system integration. These would crash the app at runtime.

**Fix (commit `71b29e1`):**
- `dm.js`: `getUserConversations()` now returns `[]` when not authenticated instead of throwing
- `useConversations.js`: Accepts `userId` parameter, skips all fetch/subscribe logic when `null`
- `OrbitThreadApp.jsx`: Passes `user?.id` to `useConversations(user?.id)`
- `OrbitThreadApp.jsx`: Replaced `setActiveDM(null); setDmMessages({})` with `setActiveConversationId(null)`
- `OrbitThreadApp.jsx`: Replaced `Object.values(dmMessages).some(...)` with `dmConversations.length > 0`

---

## Project Cleanup

**Removed files (commit `4b721ca`):**

| Deleted File | Why |
|-------------|-----|
| `src/App.css` | Vite boilerplate (logo spin animations, `.card` class) — never imported anywhere |
| `src/App.jsx` | One-line re-export wrapper — `main.jsx` now imports `OrbitThreadApp` directly |
| `src/assets/react.svg` | Vite boilerplate React logo — never referenced |
| `public/vite.svg` | Default Vite favicon — replaced by `orbit-thread.svg` |
| `src/components/DirectMessagesExample.jsx` | Reference demo component — not used in production |
| `src/lib/dm-types.ts` | TypeScript type definitions — project is pure JSX, not compiled |
| `supabase-schema.sql` (root) | Exact duplicate of `supabase/migrations/20260220000000_initial_schema.sql` |

**Removed devDependencies:**
| Package | Why |
|---------|-----|
| `@types/react` | TypeScript types — not needed in a JSX project |
| `@types/react-dom` | TypeScript types — not needed in a JSX project |

---

## Final Project Structure

```
orbit-thread/
├── index.html                  Entry HTML
├── package.json                3 deps + 5 devDeps
├── vite.config.js              Vite + React plugin
├── vercel.json                 SPA rewrite rules
├── eslint.config.js            ESLint config
├── README.md                   Roadmap & documentation
├── README2.md                  This file — dev log
├── .env                        Supabase credentials (not in git)
├── .gitignore
│
├── public/
│   └── orbit-thread.svg        Custom favicon
│
├── src/
│   ├── main.jsx                React DOM mount
│   ├── index.css               Body/html reset
│   ├── supabase.js             Supabase client init
│   ├── OrbitThreadApp.jsx      ★ Entire app (2,760 lines)
│   │
│   ├── hooks/
│   │   ├── useConversations.js     Conversation list + realtime
│   │   ├── useDirectMessages.js    Messages + realtime + dedup
│   │   └── useSendDirectMessage.js Send with optimistic UI
│   │
│   └── lib/
│       └── dm.js               DM backend functions (419 lines)
│
└── supabase/
    ├── config.toml             Supabase CLI config
    └── migrations/
        ├── 20260220000000_initial_schema.sql    Core tables (158 lines)
        └── 20260220100000_direct_messages.sql   DM tables (154 lines)
```

---

## Commit History

```
4b721ca  chore: clean up project - remove Vite boilerplate, duplicates, unused files
71b29e1  fix: resolve loading screen hang - guard DM hooks against unauthenticated state
78d255c  feat: production DM system — Supabase-backed realtime direct messages
506790e  chore: trigger Vercel rebuild with Vite framework settings
17ed96a  fix: add explicit build config to vercel.json
5785e80  fix: consolidate project to root, remove duplicate subfolder, fix Vercel deployment
71cc644  Remove temp env files
b4c548b  Fix: Hardcode Supabase fallback values in supabase.js to prevent blank page on Vercel
cbf1048  Rebrand: Replace all Voxen references with Orbit Thread across entire codebase
b4f4425  Update README with live Vercel URL, Supabase CLI workflow, project structure
84aa2ad  Merge branch 'main'
e90bcfd  Initial commit: Orbit Thread app with Supabase integration
30e1c6e  Add mini diamond inside favicon
b7b21f0  Fix favicon diamond centered properly
6030559  Update favicon to match brand icon (terracotta + white diamond)
a56781c  Replace Vite favicon with branded icon, update tab title
2e72ee1  Update README with Phase 2 features documentation
b786b29  Phase 2: Geo-radius discovery, public rooms, DMs, premium modal, image upload
47e1b34  Add comprehensive Phase 1 README
015815c  Add .env to gitignore
bdec4fe  Remove .env from tracking again
0963b77  Add vercel config and env var safety check
51b473a  Remove .env from tracking
3b29071  Voxen v3 - full stack with Supabase
```

---

## Database Schema (10 Tables Total)

### Core Tables (Migration 1)
| Table | Purpose |
|-------|---------|
| `profiles` | User data extending `auth.users` — name, handle, bio, topics, verified status, settings |
| `rooms` | Circles — name, purpose, visibility, member limit, schedule, creator |
| `room_members` | Many-to-many join: users ↔ rooms |
| `messages` | Chat messages in rooms — content, author, reactions, reply_to, image |
| `connections` | User-to-user connections — sender, receiver, status (pending/accepted/declined) |
| `notifications` | In-app notifications — type, content, read status |
| `room_creations` | Tracks daily room creation count per user (for free-tier 5/day limit) |

### DM Tables (Migration 2)
| Table | Purpose |
|-------|---------|
| `direct_conversations` | Conversation container — `created_at`, `updated_at` |
| `direct_conversation_members` | Exactly 2 members per conversation, unique constraint prevents duplicates |
| `direct_messages` | Messages — `conversation_id`, `sender_id`, `content`, `edited_at`, `deleted` flag |

### Key Database Features
- **Row Level Security** on all 10 tables — users can only access their own data
- **Auto-profile trigger** — creates profile row when `auth.users` insert fires
- **`find_dm_conversation()` function** — deduplicates conversations between same 2 users
- **`update_conversation_timestamp()` trigger** — auto-bumps `updated_at` on new message
- **Realtime enabled** on `messages`, `notifications`, `connections`, `direct_messages`
- **GIN indexes** on conversation member lookups for fast queries

---

## Tech Stack (Final)

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19.2 + Vite 7.3 | Fast SPA with HMR |
| Styling | CSS-in-JS (template literal) | Zero deps, single `const CSS` block |
| Fonts | Plus Jakarta Sans + Lora | Warm, human typography |
| Auth | Supabase Auth (email/password) | Session management, RLS integration |
| Database | Supabase PostgreSQL | 10 tables, RLS, triggers, functions |
| Realtime | Supabase Realtime (WebSocket) | Live messages in rooms + DMs |
| Hosting | Vercel | Auto-deploy from `main`, CDN, SSL |
| Source Control | Git + GitHub | 22 commits on main |

### Dependencies (Production)
```
@supabase/supabase-js  ^2.97.0
react                  ^19.2.0
react-dom              ^19.2.0
```

### Dev Dependencies
```
@eslint/js                    ^9.39.1
@vitejs/plugin-react          ^5.1.1
eslint                        ^9.39.1
eslint-plugin-react-hooks     ^7.0.1
eslint-plugin-react-refresh   ^0.4.24
globals                       ^16.5.0
vite                          ^7.3.1
```

---

## What's Next

See [README.md](README.md) for the full roadmap — Phases 3 through 7 covering:

- **Phase 3:** Wire remaining mocks to Supabase (connections, geo rooms, Stripe, Google OAuth)
- **Phase 4:** Launch OrbitThread.com (custom domain, SEO, legal pages)
- **Phase 5:** Native mobile apps (React Native + Expo → Play Store + App Store)
- **Phase 6:** Scale features (posts, stories, video calls, admin tools)
- **Phase 7:** Monetization & growth (real Stripe, analytics, marketing)

---

*Built by Sam — February 2026.*
