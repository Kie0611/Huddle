# Huddle — Backend-First Blueprint

**Tagline:** *Draw together. Then it's gone.*

## Overview
Huddle is a real-time collaborative freehand whiteboard for quick meetings
and workshops. Multiple people draw strokes and drop sticky notes on a
shared board, synced live across all connected clients. No accounts —
people join ephemeral, private rooms via a short code or QR scan, and
inactive rooms self-delete after an hour. Boards can be exported before they
disappear.

This blueprint sequences the project **backend-first**: the data layer, API,
and realtime broadcasting are built and fully tested before any frontend
rendering code is written.

---

## Tech Stack

| Layer          | Choice                              | Why |
|----------------|--------------------------------------|-----|
| Framework      | Next.js (App Router) + TypeScript    | API routes + frontend in one repo |
| Database       | Neon (serverless Postgres)           | Scales to zero, fast cold starts |
| ORM            | Drizzle                              | Typed, explicit SQL, schema-as-code |
| Realtime       | Liveblocks                           | Purpose-built for multiplayer/presence/canvas use cases; one Liveblocks "room" maps naturally onto one app room |
| Room codes     | `nanoid` (short IDs)                 | Generates compact, URL-safe room codes |
| QR generation  | `qrcode` npm package                 | Renders a QR for the room's join URL, client- or server-side |
| Scheduled cleanup | Vercel Cron                       | Periodically sweeps and deletes inactive rooms — no separate infra needed |
| Rendering (later) | HTML5 Canvas                      | Smooth freehand strokes, performant redraw at scale |

---

## Installation & Setup

```bash
# 1. Scaffold the project
npx create-next-app@latest huddle --typescript --tailwind --app --eslint
cd huddle

# 2. Core dependencies
npm install drizzle-orm @neondatabase/serverless
npm install @liveblocks/client @liveblocks/react
npm install nanoid qrcode
npm install zod                    # request body validation for API routes

# 3. Dev dependencies
npm install -D drizzle-kit
npm install -D @types/qrcode
npm install -D tsx                 # for running scratch scripts (Phase 2, 5)
```

**Environment variables** — create `.env.local` in the project root:

```bash
# Neon (from your Neon project's dashboard → Connection Details)
DATABASE_URL=postgresql://user:password@ep-xxxx.neon.tech/huddle?sslmode=require

# Liveblocks (from your Liveblocks dashboard → API keys)
LIVEBLOCKS_SECRET_KEY=sk_dev_xxxxxxxxxxxx
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=pk_dev_xxxxxxxxxxxx
```

**Drizzle config** — create `drizzle.config.ts` in the project root:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Run your first migration**, after writing `db/schema.ts` (Phase 1/2):

```bash
npx drizzle-kit generate   # generates SQL migration files from schema.ts
npx drizzle-kit migrate    # applies them to your Neon database

# during early prototyping, you can skip migration files entirely and
# push schema changes directly:
npx drizzle-kit push
```

**Start the dev server:**

```bash
npm run dev
```

**Vercel Cron setup** (Phase 5.5) — add to `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-rooms",
      "schedule": "*/10 * * * *"
    }
  ]
}
```
This only takes effect once deployed to Vercel — locally, trigger
`POST /api/cron/cleanup-rooms` manually (e.g. via curl) to test it.

---

```ts
// db/schema.ts
import { pgTable, integer, varchar, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 12 }).notNull().unique(), // shareable room code
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
});

export const strokes = pgTable("strokes", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }).notNull(),
  points: jsonb("points").notNull(), // Array<{ x: number; y: number }>
  color: varchar("color", { length: 7 }).notNull(), // hex code, or "eraser"
  thickness: integer("thickness").notNull(), // px, from a small fixed set
  authorId: uuid("author_id"), // session ID, nullable
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stickyNotes = pgTable("sticky_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }).notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  text: varchar("text", { length: 280 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(), // note background color
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Notes**
- Every table is scoped by `roomId` with `onDelete: "cascade"` — deleting a
  room automatically wipes its strokes, notes, and any rate-limit data in
  one operation, no manual multi-table cleanup needed.
- A **stroke** is one continuous pen movement (mousedown → mousemove →
  mouseup), stored as an ordered array of `{x, y}` points in a single row —
  not one row per point. This keeps the table small and each stroke atomic
  (it either fully exists or doesn't).
- There's no `pixels` table anymore and no upsert-on-coordinate-conflict
  logic — strokes are pure inserts, since two people can never "collide" on
  the same stroke the way two people could collide on the same pixel cell.
- `sessionId` (stored as `authorId`) is a random ID generated client-side
  and stored in a cookie scoped to that room — not an account, just enough
  identity to let people erase/edit their own sticky notes and to apply
  lightweight rate-limiting.
- **Eraser tool:** implemented as a normal stroke with `color` set to the
  board's background color, drawn on top of existing strokes. This is far
  simpler than actually deleting/trimming prior strokes, at the cost of not
  being a "true" eraser — worth noting as a deliberate simplification in
  your case study, with "real" eraser (stroke-splitting) as a stretch goal.
- `text` on sticky notes is capped at 280 chars to keep notes glanceable.

---

## Build Sequence

### Phase 1 — Project Skeleton (no UI)
- Scaffold Next.js normally; leave `app/page.tsx` as the default placeholder.
- All work happens in `app/api/`, `db/`, and `lib/`.
- Set up Neon project, connect Drizzle, run first migration.

### Phase 2 — Database Layer
- Write core query functions in isolation (no HTTP yet):
  - `createRoom(): Promise<Room>` — generates a `nanoid` code, inserts a row.
  - `getRoomByCode(code): Promise<Room | null>`
  - `touchRoom(roomId): Promise<void>` — bumps `lastActiveAt` to now.
  - `getStrokes(roomId): Promise<Stroke[]>`
  - `createStroke(roomId, points, color, thickness, sessionId): Promise<Stroke>`
  - `checkRateLimit(roomId, sessionId): Promise<boolean>` — e.g. reject if
    more than N strokes were created by this session in the last few seconds.
- Test via a scratch script (`tsx scripts/test-db.ts`), not a UI.
- Validate: inserting strokes with realistic point arrays, rate-limit
  rejection kicking in correctly, and that two different rooms never see
  each other's strokes.

### Phase 3 — API Routes
- `POST /api/rooms` → creates a room, returns `{ code }` (used to build the
  join URL and QR code).
- `GET /api/rooms/[code]` → validates a room exists and is still active;
  calling this also calls `touchRoom` so simply loading the room resets its
  inactivity clock.
- `GET /api/rooms/[code]/strokes` → returns all strokes for that room, in
  creation order (plain JSON array — see "Payload Efficiency" below).
- `POST /api/rooms/[code]/strokes` → body `{ points, color, thickness }`,
  checks rate limit, writes to DB, calls `touchRoom`, returns the created
  stroke.
- `GET /api/rooms/[code]/notes` → returns all sticky notes for that room.
- `POST /api/rooms/[code]/notes` → body `{ x, y, text, color }`, creates a
  note, calls `touchRoom`.
- `PATCH /api/rooms/[code]/notes/[id]` → edit a note's text/color
  (author-only, checked against the session ID).
- `DELETE /api/rooms/[code]/notes/[id]` → remove a note (author-only).
- `POST /api/cron/cleanup-rooms` → deletes any room where `lastActiveAt` is
  older than 1 hour (cascades to strokes/notes automatically). Triggered by
  Vercel Cron, not by a user request — see Phase 5.5.
- Test exclusively with `curl` / Postman / Thunder Client:
  - Valid stroke creation succeeds and returns the full stroke back.
  - Excess rapid stroke creation from one session is rate-limited.
  - Empty or malformed point arrays are rejected.
  - A stroke created in room A never shows up when querying room B.

### Phase 4 — Realtime Broadcasting
- Use one Liveblocks room per app room (the room `code` doubles as the
  Liveblocks room ID) — this keeps realtime scoping trivial, since each
  Liveblocks room is naturally isolated already.
- On successful `createStroke`, broadcast the completed stroke as one event:
  `{ type: "stroke:create", stroke }`. Broadcasting once per completed
  stroke (not per point) keeps the channel from being flooded during active
  drawing.
- On note create/edit/delete, broadcast a corresponding event:
  `{ type: "note:create" | "note:update" | "note:delete", note }`.
- Verify using Liveblocks' dashboard/debug event log while hitting the API
  with `curl` — confirm events fire with no frontend involved, and confirm
  events for room A never appear in room B's channel.
- **Stretch goal:** broadcast in-progress points (throttled, e.g. every
  50ms) via Liveblocks' presence/ephemeral events so other users see a
  stroke being drawn live rather than only once it's finished.

### Phase 5 — Load Simulation
- Write a Node script that spins up N fake "users" issuing rapid stroke
  `POST`s (with realistic multi-point arrays) within a single test room.
- Use this to stress-test:
  - Rate-limit enforcement under concurrent load.
  - API response times as the number of strokes in a room grows large.
  - Payload size of `GET /strokes` as stroke count increases.
- This script doubles as a good portfolio talking point — deliberate load
  testing, not accidental bug discovery.

### Phase 5.5 — Room Lifecycle & Cleanup
- Set up a Vercel Cron job (e.g. every 10 minutes) hitting
  `POST /api/cron/cleanup-rooms`.
- That route runs a single query: delete all rooms where
  `lastActiveAt < now() - interval '1 hour'`. `ON DELETE CASCADE` foreign
  keys handle removing strokes and notes automatically.
- Test this in isolation before building any UI: manually insert a room with
  an old `lastActiveAt` via your test script, run the cleanup route, and
  confirm the room and all its child rows are gone.
- Decide (and document) what happens if someone hits a dead room's URL after
  expiry — a clean "this room no longer exists" response, not a raw 500 or
  an empty broken canvas.

### Phase 6 — Frontend (only after backend is a trusted contract)
- **Landing page:** "Create a room" button (calls `POST /api/rooms`, then
  redirects to `/room/[code]`) and a "Join a room" input for entering a
  code directly. Lead with the tagline ("Draw together. Then it's gone.")
  to set expectations about the ephemeral nature right away.
- **Room page (`/room/[code]`):** on load, calls `GET /api/rooms/[code]` to
  validate the room is active; shows a clean "room not found or expired"
  state if not.
- **QR code:** rendered on the room page (via the `qrcode` package) encoding
  the full join URL, so a phone scan drops someone straight into the room.
- **Drawing:** capture `pointermove` events while the pen/mouse is down,
  buffer points locally, and on pointer-up send the full stroke to the API
  while immediately rendering it locally (optimistic).
- Subscribe to the room's Liveblocks channel; append incoming strokes/notes
  to the canvas rather than re-fetching everything.
- A small toolbar: color picker (curated palette), brush size (small/medium/
  large), and an eraser toggle.
- Pan/zoom via a transform matrix, since a fixed-size board benefits from
  being able to zoom in for detail work.
- Presence: live user count, optionally throttled live cursors.
- **Sticky notes layer:** rendered as absolutely-positioned HTML elements on
  top of the canvas (not drawn into the canvas bitmap), so they stay
  editable/clickable independent of stroke rendering. Position them by
  converting board coordinates to screen coordinates using the same
  pan/zoom transform as the canvas.
- A toggle to show/hide notes, since a busy board + many notes can get
  visually noisy fast.
- A subtle "room is inactive for X more minutes before it expires" indicator
  makes the ephemeral nature visible rather than surprising.

### Phase 7 — Export Feature
- **Export board as PNG:** `canvas.toDataURL("image/png")` on the existing
  canvas element, triggered as a download. No extra library needed.
- **Export board + notes as PNG:** draw the sticky notes onto an offscreen
  canvas (rectangle + wrapped text via `fillText`) on top of a copy of the
  drawn strokes, then export that composite. This is the "flattened" export
  someone would actually want to share after a meeting.
- **Export full state as JSON:** `{ strokes: [...], notes: [...],
  exportedAt }` — a portable snapshot, and a natural stepping stone toward a
  future "reopen a saved board" feature.
- Keep export client-side (no server round trip needed) since the client
  already holds the full board state in memory.

### Phase 8 — Deploy & Case Study
- Deploy to Vercel.
- Record a demo video: create a room, scan the QR from a phone, draw and
  drop notes from two devices simultaneously, then export.
- Write up technical highlights: room isolation and cascading cleanup,
  stroke-based (not pixel-based) data modeling, rate-limiting design,
  optimistic drawing with realtime sync.

---

## Payload Efficiency (Important Detail)

Unlike a fixed pixel grid, a whiteboard's data size grows unboundedly with
usage — a long meeting produces many long strokes. Options, in increasing
complexity:

1. **Plain JSON array of strokes** — fine for a typical short meeting
   session (the target use case), easiest to implement first.
2. **Point simplification** (e.g. Douglas-Peucker algorithm) — reduce the
   number of points per stroke before saving, without visibly changing the
   line's shape. Worth adding once you notice strokes have far more points
   than needed for smoothness.
3. **Periodic flattening** — for very long-lived or very busy rooms,
   render older strokes into a static background image and only keep recent
   strokes as editable/live data. Not needed given the 1-hour room lifetime,
   but worth mentioning as a "how I'd scale this" note.

Start with option 1 — the 1-hour room expiry naturally caps how large any
board's data can realistically get, so this is one place the ephemeral-room
design directly simplifies the engineering.

---

## Key Engineering Challenges (Portfolio Talking Points)

- **Room isolation and lifecycle:** every query must be correctly scoped by
  `roomId` (never leaking one room's data into another), and the inactivity
  sweep must reliably reclaim expired rooms without a race between "room is
  being cleaned up" and "someone just started actively using it again."
- **Rate-limiting without a rigid cooldown:** unlike a pixel-placement
  cooldown, a whiteboard needs people to draw continuously — so rate limits
  have to bound *abuse* (e.g. scripted stroke flooding) without making
  normal drawing feel throttled.
- **Deterministic render order:** strokes from different users arriving out
  of order (due to network timing) must still render in a consistent
  creation order across all clients, or the board will look different on
  different screens.
- **Realtime consistency on reconnect:** clients that drop and reconnect
  must not silently miss strokes or notes created while offline.
- **Payload growth over a session:** a board's data size grows with stroke
  count and stroke length; see "Payload Efficiency" above for how the
  1-hour lifetime keeps this bounded by design.

---

## Suggested Repo Structure

```
/app
  /api
    /rooms
      route.ts            # POST create room
      /[code]
        route.ts          # GET room status (also touches lastActiveAt)
        /strokes
          route.ts         # GET all strokes, POST new stroke
        /notes
          route.ts         # GET all notes, POST new note
          /[id]
            route.ts       # PATCH, DELETE a note
    /cron
      /cleanup-rooms
        route.ts           # deletes rooms inactive > 1 hour
  page.tsx                 # landing: create/join room
  /room
    /[code]
      page.tsx             # the actual whiteboard room UI (Phase 6)
/db
  schema.ts                # Drizzle schema (rooms, strokes, stickyNotes)
  index.ts                 # Drizzle client setup
/lib
  rooms.ts                 # createRoom, getRoomByCode, touchRoom
  strokes.ts               # getStrokes, createStroke, checkRateLimit
  notes.ts                 # getNotes, createNote, updateNote, deleteNote
  liveblocks.ts            # broadcast helpers
  export.ts                # PNG + composite PNG + JSON export helpers
/scripts
  test-db.ts               # manual DB query testing
  load-test.ts             # simulated concurrent users
```

---

## Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Drawing model | Freehand strokes (point arrays), not a pixel grid | Matches the actual product intent — a whiteboard, not pixel art |
| Board dimensions | Fixed virtual size (e.g. 1920×1080) with pan/zoom | Simpler than a true infinite canvas, while still giving working room |
| Palette | ~12 curated colors + 3 brush sizes | Keeps the toolbar simple; avoids the complexity of a full color picker for an MVP |
| Eraser | A stroke drawn in the background color | Much simpler than true stroke deletion/trimming; documented as a deliberate MVP simplification |
| Rate limiting | Lightweight per-session cap (e.g. max N strokes per few seconds), not a strict placement cooldown | A whiteboard needs continuous drawing to feel natural; limiting is about abuse prevention, not pacing |
| Auth model | No accounts. Private rooms via a shareable code / QR code, with a client-generated session ID (cookie, scoped per room) for note authorship | Matches the "quick meeting" use case; simpler to build than real auth |
| Room lifecycle | Auto-delete after 1 hour of inactivity, swept by a scheduled cleanup job | Fits the "disposable meeting whiteboard" purpose exactly; also naturally bounds data growth |
| Rate-limit store | Postgres query (count recent strokes), not Redis | Fast enough at this scale, avoids running a second service |

---

## Feature: Private Rooms & Auto-Expiry

No accounts, no persistent global board — every session happens inside an
ephemeral room, entered via a short code or a QR scan.

- **Creating a room:** hitting "Create a room" generates a short `nanoid`
  code and inserts a `rooms` row; the user is redirected to `/room/[code]`.
- **Joining a room:** either type the code in on the landing page, or scan a
  QR code (rendered on the room page itself) that encodes the full join URL
  — handy for getting a group physically in the same space into the same
  room instantly at the start of a meeting.
- **Session identity within a room:** a random session ID is generated
  client-side and stored in a cookie scoped to that room path. It's not an
  account — just enough identity to let people edit only their own sticky
  notes and to apply lightweight rate-limiting.
- **Inactivity expiry:** every write (stroke, note create/edit) bumps the
  room's `lastActiveAt` timestamp. A scheduled job checks periodically for
  rooms inactive past 1 hour and deletes them; `ON DELETE CASCADE` foreign
  keys clean up all associated strokes and notes automatically.
- **Visiting an expired/nonexistent room:** show a clear "this room doesn't
  exist or has expired" state rather than a blank canvas or a server error.

## Feature: Sticky Notes

Freeform text notes users can pin anywhere on the board — a separate layer
from strokes, meant for messages, action items, or labeling parts of a
sketch during a meeting.

- Pinned at an `(x, y)` position, rendered as small colored cards floating
  above the canvas.
- Editable and deletable only by their original author (checked via session
  ID, not full auth).
- Synced in realtime the same way strokes are — a `note:create` /
  `note:update` / `note:delete` event on the Liveblocks channel.
- Capped length (280 chars) and a show/hide toggle to keep the board legible
  once a lot of notes accumulate.

## Feature: Export

Three export options, all client-side (no server round trip):

1. **Board-only PNG** — straightforward `canvas.toDataURL()` download.
2. **Board + notes composite PNG** — notes drawn onto an offscreen canvas on
   top of the strokes, then exported as one flattened image. This is the
   version someone would actually want to share after a meeting.
3. **Full JSON snapshot** (`strokes` + `notes` + timestamp) — a portable
   backup of the whole board's state, and a natural stepping stone toward a
   future "reopen a saved board" feature.
