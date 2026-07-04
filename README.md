# LightTrack Backend API

## 1. Project

**LightTrack** is a dual-axis solar tracker with camera-based dirt detection on the
panel surface. It keeps a solar panel pointed at the sun for maximum output and uses a
camera to watch how dirty the panel gets, alerting the operator when the panel needs
cleaning.

This repository is the **cloud backend** of LightTrack. It is one of four separate
projects that make up the full system:

```
ESP32 firmware  ->  Raspberry Pi gateway  ->  this backend (cloud)  ->  web dashboard
```

- **ESP32 firmware** reads the light sensors, drives the servo motors, and talks to the
  gateway over the local network.
- **Raspberry Pi gateway** bridges the ESP32 to the cloud and runs the camera / vision
  pipeline.
- **This backend** runs in the cloud. It is the single point that stores data and the
  only component that writes to the database. The gateway does not write to the database
  directly — every change goes through this service.
- **Web dashboard** (a separate Next.js app) lets the user watch the panel and send it
  commands.

### Main features

- **Telemetry ingestion** — receives sensor readings from the gateway (panel angles,
  light sensors, battery, solar power, energy), validates them, and stores them.
- **Command relay with a status lifecycle** — the dashboard sends a command (for example
  "switch to automatic mode" or "move the panel"), the backend records it and forwards it
  down to the device, then tracks it through its lifecycle: *pending → sent →
  acknowledged*, or *failed* if the device never confirms in time.
- **Vision / camera processing with cleaning alerts** — takes the dirt-detection results
  from the camera pipeline, stores them, and when the panel crosses into a "needs
  cleaning" state it sends a cleaning-alert email to the registered users.
- **Device online / offline tracking** — watches the heartbeats from the hardware and
  marks a device offline when it stops reporting, recording a system event.
- **REST + WebSocket API for the dashboard** — a REST API for reading history and
  summaries and for sending commands, plus a live WebSocket feed so the dashboard updates
  in real time. A second WebSocket endpoint is used by the Raspberry Pi gateway to stream
  data up and receive commands.

### Technology

- Node.js with Express, written in **TypeScript** (strict mode)
- Zod for validating every request and message
- WebSocket via the `ws` library
- Supabase (PostgreSQL, Auth, Storage) for storage and authentication
- Resend for cleaning-alert emails
- Deployed on **Railway**

---

## 2. Deliverables / Repository

- **Repository:** `<https://gitlab.upt.ro/...>`

The repository contains the **full source code** of the backend. It does **not** contain
any compiled binaries or downloaded libraries:

- `dist/` (the compiled output) is **not** committed — it is produced by the build step.
- `node_modules/` (the installed dependencies) is **not** committed — it is produced by
  installing the dependencies.

Both are regenerated locally with the steps below.

---

## 3. Requirements / Dependencies

- **Node.js version 22 or newer** (`"engines": { "node": ">=22.0.0" }` in `package.json`).
- This is a **TypeScript** project, so it must be compiled before it runs in production.
- All other dependencies are listed in `package.json` and are installed with a single
  command from the project root:

```
npm install
```

This downloads every required library into `node_modules/`.

---

## 4. Configuration

Configuration is supplied through environment variables. In development they are read from
a `.env` file in the project root, which is loaded automatically at startup. All variables
are validated when the server starts; if a required one is missing or invalid, the server
stops with a clear error message.

Only the **names** are listed here — the actual values (keys, URLs, secrets) must be filled
in and must never be committed to the repository.

### Required

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CORS_ORIGIN
DEVICE_API_KEY
EXPECTED_DEVICE_ID
```

### Optional (have sensible defaults)

```
PORT
NODE_ENV
COMMAND_TIMEOUT_SECONDS
COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS
DEVICE_OFFLINE_AFTER_SECONDS
DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS
FRONTEND_RATE_LIMIT_WINDOW_MINUTES
FRONTEND_RATE_LIMIT_MAX
RESEND_API_KEY
ALERT_EMAIL_TO
ALERT_EMAIL_FROM
DEFAULT_DEVICE_ID
WS_HEARTBEAT_TIMEOUT_MS
PROTOCOL_PING_INTERVAL_MS
PROTOCOL_PING_TIMEOUT_MS
WS_RATE_LIMIT_WINDOW_MS
WS_RATE_LIMIT_MAX_MESSAGES
MAX_TIME_SINCE_REAUTH_MS
CLIENT_TOKEN_CHECK_INTERVAL_MS
MESSAGE_DEDUP_CACHE_SIZE
MESSAGE_DEDUP_TTL_MS
RECONNECT_GRACE_MS
GRACEFUL_SHUTDOWN_DRAIN_MS
```

`RESEND_API_KEY` and `ALERT_EMAIL_TO` enable the cleaning-alert email; if they are not
set, the alert is simply skipped and everything else works normally.

The full definition of every variable, including its default value, is in
`src/config/env.ts`.

---

## 5. Build / Compilation

The TypeScript source in `src/` is compiled to plain JavaScript in `dist/`:

```
npm run build
```

This runs the TypeScript compiler (`tsc`) and produces the `dist/` folder, which is what
runs in production.

---

## 6. Run / Launch

### Development

```
npm run dev
```

Starts the server directly from the TypeScript source and automatically restarts whenever
a file in `src/` changes. No build step is needed for development.

### Production

Build first, then start the compiled output:

```
npm run build
npm start
```

`npm start` runs `node dist/server.js`, so the project must be built beforehand.

### With Docker

The project includes a `Dockerfile` (a multi-stage build that compiles the project and
runs the compiled output as a non-root user) and a `docker-compose.yml`.

Build and run the container:

```
docker build -t lighttrack-api .
docker run --env-file .env -p 3001:3001 lighttrack-api
```

Or, using Docker Compose (which reads the environment from a `.env` file and exposes the
service on port 3001):

```
docker compose up --build
```

### Deployment

The backend is deployed on **Railway**, which builds the project from the `Dockerfile` and
starts it with `node dist/server.js` (see `railway.toml`). Railway checks the `/health`
endpoint to confirm the service is running.
