# LightTrack API

Express TypeScript backend API and MQTT ingestion worker for the LightTrack solar tracker thesis project.

---

## 1. Project Overview

LightTrack is an IoT solar tracking system. This backend bridges embedded devices (ESP32 via Raspberry Pi gateway) with a cloud database (Supabase) and a Next.js frontend dashboard deployed on Vercel.

The backend runs persistently on Railway and is responsible for:

- Ingesting real-time telemetry from IoT devices via MQTT
- Persisting data to Supabase PostgreSQL
- Exposing REST endpoints for the frontend dashboard
- Publishing commands to IoT devices via MQTT
- Tracking command lifecycle and handling timeouts
- Detecting offline devices
- Fetching and caching sun schedule data from Open-Meteo
- Generating signed URLs for private image access in Supabase Storage

---

## 2. Architecture

```
ESP32 (C, FreeRTOS)
    |
    | MQTT — local Mosquitto broker
    v
Raspberry Pi 3B (Python gateway)
    |
    | MQTT over TLS — cloud broker
    v
Cloud MQTT Broker (e.g. HiveMQ, EMQX, Mosquitto)
    |
    | Subscribe / Publish
    v
Express API + MQTT Worker (Railway)  ← THIS PROJECT
    |
    | Supabase service_role key (server-side only)
    v
Supabase PostgreSQL + Storage

──────────────────────────────────────────

Next.js Dashboard (Vercel)
    |
    | HTTPS REST + Bearer JWT
    v
Express API (Railway)  ← THIS PROJECT
    |
    | service_role key
    v
Supabase PostgreSQL + Storage

──────────────────────────────────────────

Express API
    |
    | HTTPS fetch, no auth required
    v
Open-Meteo API (free)
```

---

## 3. MQTT vs REST

### MQTT — Real-Time IoT

Used exclusively for communication between the Raspberry Pi gateway and this backend.

| Direction | Path |
|-----------|------|
| Pi → Backend | Telemetry, events, vision results, device status, command ACKs |
| Backend → Pi | Commands (SET_MODE, MOVE_PANEL, etc.) |

The frontend **never** connects to MQTT. MQTT credentials are never sent to the frontend.

### REST — Frontend Application

Used for all frontend interactions: authentication, dashboard data, history, analytics, commands, configuration, image access.

| Client | Calls |
|--------|-------|
| Next.js frontend | `/api/*` with Bearer JWT from Supabase Auth |
| Backend | Supabase PostgreSQL via service_role key |
| Backend | Open-Meteo (no auth) |

### WebSocket

Not implemented. Optional future work for live dashboard updates without polling.

---

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in all required values.

### Required

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP server port (default: 3001) |
| `NODE_ENV` | `development` or `production` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (keep secret) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `LOCATION_LAT` | Panel latitude for sun/weather data |
| `LOCATION_LON` | Panel longitude for sun/weather data |
| `MQTT_BROKER_URL` | MQTT broker URL (e.g. `mqtts://broker.example.com:8883`) |
| `MQTT_USERNAME` | MQTT broker username |
| `MQTT_PASSWORD` | MQTT broker password (keep secret) |
| `MQTT_CLIENT_ID` | Unique client ID for this backend instance |

### Optional (have defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_QOS` | `1` | MQTT QoS level (0 or 1) |
| `SUPABASE_STORAGE_BUCKET` | `panel-images` | Storage bucket name |
| `COMMAND_TIMEOUT_SECONDS` | `10` | Seconds before a SENT command is marked FAILED |
| `COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS` | `30` | How often to check for timed-out commands |
| `DEVICE_OFFLINE_AFTER_SECONDS` | `90` | Seconds of silence before a device is marked offline |
| `DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS` | `30` | How often to check for offline devices |
| `FRONTEND_RATE_LIMIT_WINDOW_MINUTES` | `15` | Rate limit window for REST endpoints |
| `FRONTEND_RATE_LIMIT_MAX` | `100` | Max requests per window per IP |

All required variables are validated at startup using Zod. Missing variables cause the process to exit with a clear error message.

---

## 5. MQTT Broker Setup

The backend connects to any standard MQTT broker over TLS (`mqtts://`).

Recommended brokers:

- **HiveMQ Cloud** (free tier available)
- **EMQX Cloud**
- **Self-hosted Mosquitto** with TLS configured

The Raspberry Pi gateway connects to the same cloud broker with its own credentials (separate from the backend's credentials). The Pi never connects to Supabase directly.

Configure the broker to:

- Require TLS on port 8883
- Require username/password authentication
- Create two users: one for the backend, one for the Pi

---

## 6. MQTT Topics and Payloads

### Topics subscribed by backend

#### `lighttrack/telemetry`

Published by Raspberry Pi every 5 seconds. Validated and inserted into `sensor_readings`.

```json
{
  "timestamp": "2026-05-11T14:35:42Z",
  "panel": { "horizontalAngle": 90, "verticalAngle": 45, "trackingMode": "AUTO", "isMoving": false },
  "light": { "topLeft": 2860, "topRight": 2850, "bottomLeft": 2800, "bottomRight": 2810, "horizontalDifference": 10, "verticalDifference": 30 },
  "battery": { "voltage": 7.8, "estimatedPercent": 65, "status": "CHARGING" },
  "solar": { "voltage": 18.2, "current": 0.58, "power": 10.6, "energyTodayWh": 142.4 },
  "charging": { "voltage": 7.8, "current": 0.52, "power": 4.1, "energyTodayWh": 128.6 },
  "system": { "esp32Online": true, "errors": [] }
}
```

#### `lighttrack/events`

Published by Pi on threshold or status change. Inserted into `system_events`.

```json
{ "event_type": "BATTERY_LOW", "severity": "WARNING", "message": "Estimated battery level below threshold" }
```

#### `lighttrack/vision`

Published by Pi after each camera analysis. Inserted into `vision_results`.

```json
{
  "timestamp": "2026-05-11T14:35:00Z",
  "dirt_level_percent": 8.2,
  "cleanliness_percent": 91.8,
  "cleaning_required": false,
  "confidence": 0.94,
  "image_path": "raw/2026-05-11/image_143500.jpg",
  "processed_image_path": "processed/2026-05-11/mask_143500.jpg"
}
```

#### `lighttrack/status`

Published by Pi on startup or periodically. Upserts `device_status`.

```json
{ "device_name": "RASPBERRY_PI", "is_online": true, "firmware_version": "v1.2.3", "status_message": "Gateway online" }
```

#### `lighttrack/commands/ack`

Published by Pi after executing a command. Updates `device_commands`.

```json
{ "id": "uuid", "status": "ACKNOWLEDGED", "ack_payload": { "executed": true }, "message": "Mode changed to AUTO" }
```

### Topics published by backend

#### `lighttrack/commands`

Published after a command is created via `POST /api/commands`.

```json
{ "id": "command-uuid", "commandType": "SET_MODE", "payload": { "mode": "AUTO" } }
```

---

## 7. REST Endpoints

All `/api/*` endpoints require `Authorization: Bearer <Supabase JWT>`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Simple uptime check |
| GET | `/health/deep` | None | Checks Supabase and MQTT connectivity |

### Sensor Readings

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/api/readings/latest` | — | Latest telemetry reading |
| GET | `/api/readings/history` | `limit`, `offset`, `start_date`, `end_date` | Historical telemetry |
| GET | `/api/readings/stats` | `hours` (24/168/720) | Aggregated stats |

### Vision / Dirt Detection

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/api/vision/latest` | — | Latest dirt detection result |
| GET | `/api/vision/history` | `limit`, `start_date`, `end_date` | Dirt detection history |

### System Events

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/api/events/recent` | `severity`, `limit` | Recent system events |

### Devices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/devices` | All device statuses |
| GET | `/api/devices/:device_name/last-seen` | Single device status |

### Commands

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/commands` | Create and dispatch a command |
| GET | `/api/commands/recent` | Command history with status filter |

**POST body:**
```json
{ "command_type": "SET_MODE", "payload": { "mode": "AUTO" } }
```

**Available command types:** `SET_MODE`, `MOVE_PANEL`, `RESET_POSITION`, `REQUEST_STATUS`, `START_TRACKING`, `STOP_TRACKING`, `TRIGGER_CLEANING`

### Sun Schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sun/today` | Today's sunrise, sunset, daylight hours |
| GET | `/api/sun/week` | 7-day sun schedule |

### Energy

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/api/energy/summary` | `days` (1/7/30) | Energy production summary |
| GET | `/api/energy/dirt-impact` | `days` | Dirt impact on energy with recommendation |

### Storage

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/api/storage/signed-read-url` | `path` | Generate signed URL for private image access |

---

## 8. Supabase Setup

### Tables

Create the following tables in Supabase SQL editor:

- `sensor_readings` — IoT telemetry (see schema in CLAUDE.md)
- `vision_results` — Dirt detection results
- `system_events` — Operational events and alerts
- `device_status` — Hardware component health
- `device_commands` — Command lifecycle tracking
- `solar_schedule` — Cached sunrise/sunset data (SQL in `src/migrations/solar_schedule.sql`)

### Authentication

Frontend authenticates via Supabase Auth. The resulting JWT is sent to this backend on every request. The backend validates it using the Supabase client with the service role key.

### Service Role Key

The `SUPABASE_SERVICE_ROLE_KEY` is used **only** in this backend. It never reaches the frontend or the Raspberry Pi. It bypasses Supabase row-level security, so it must be treated as a root credential.

---

## 9. Supabase Storage — Image Strategy

Images captured by the Raspberry Pi camera are uploaded to the `panel-images` bucket.

**Path convention:**
```
raw/YYYY-MM-DD/<filename>.jpg        # Original camera image
processed/YYYY-MM-DD/<filename>.jpg  # Annotated/masked output
```

**Database stores only the relative path**, never base64 data.

The frontend requests signed read URLs through this backend:
```
GET /api/storage/signed-read-url?path=raw/2026-05-11/image_143500.jpg
```

The backend uses the service role key to generate a 1-hour signed URL from Supabase Storage and returns it to the frontend. Direct frontend-to-Supabase storage access is not used.

Allowed paths must match `raw/YYYY-MM-DD/filename.jpg` or `processed/YYYY-MM-DD/filename.jpg` to prevent path traversal.

---

## 10. Open-Meteo

Used to fetch sunrise and sunset times for energy calculations and sun schedule display. No API key required.

**Endpoint:** `https://api.open-meteo.com/v1/forecast`

**Parameters:** latitude, longitude, daily=sunrise,sunset, timezone=Europe/Bucharest, forecast_days=7

Results are cached in the `solar_schedule` table. The cache is refreshed daily at 05:00 by a background job.

If Open-Meteo is unreachable when the frontend requests sun data and no cached data exists, the endpoint returns HTTP 502.

---

## 11. Command Flow

1. Frontend sends `POST /api/commands` with Bearer JWT
2. Backend validates JWT and request body
3. Backend inserts command into `device_commands` with status `PENDING`
4. Backend publishes the command to `lighttrack/commands` MQTT topic
5. On publish success: status updated to `SENT`, `sent_at` set
6. On publish failure: status updated to `FAILED`, `error_message` set
7. Backend returns the command DTO to the frontend

**Raspberry Pi side:**
1. Pi receives command from `lighttrack/commands`
2. Pi forwards to ESP32 via local Mosquitto MQTT
3. ESP32 executes, ESP32 signals Pi
4. Pi publishes ACK to `lighttrack/commands/ack`

**Backend receives ACK:**
1. Validates ACK payload
2. Updates `device_commands` with status `ACKNOWLEDGED` or `FAILED`
3. Sets `acknowledged_at`
4. Stores `ack_payload` and any error message

---

## 12. Command Timeout

A background job runs every `COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS` seconds (default 30).

It finds all commands with status `SENT` and `sent_at` older than `COMMAND_TIMEOUT_SECONDS` seconds (default 10). For each timed-out command:

- Status set to `FAILED`
- `error_message` set to `"Command acknowledgment timeout"`
- A `COMMAND_TIMEOUT` system event is inserted with `severity: WARNING`

The frontend can poll `GET /api/commands/recent` to see the updated status.

---

## 13. Device Offline Detection

A background job runs every `DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS` seconds (default 30).

It checks all `device_status` rows where `is_online = true`. If `last_seen` is older than `DEVICE_OFFLINE_AFTER_SECONDS` seconds (default 90):

- `is_online` set to `false`
- `updated_at` set to now
- A system event is inserted (`ESP32_OFFLINE`, `RASPBERRY_PI_OFFLINE`, or `DEVICE_OFFLINE`) with `severity: WARNING`

The event is only inserted once per transition (online → offline). No duplicate events are generated if the device stays offline.

---

## 14. System Event Types

Events are inserted into `system_events` by backend services and MQTT handlers. The frontend reads them via `GET /api/events/recent`.

| Event | Severity | Trigger |
|-------|----------|---------|
| `BATTERY_LOW` | CRITICAL | Battery voltage critically low in telemetry |
| `BATTERY_HIGH` | CRITICAL | Battery voltage critically high in telemetry |
| `CLEANING_REQUIRED` | WARNING | Vision result has `cleaning_required: true` |
| `ESP32_OFFLINE` | WARNING | ESP32 not seen for 90s |
| `RASPBERRY_PI_OFFLINE` | WARNING | Raspberry Pi not seen for 90s |
| `COMMAND_TIMEOUT` | WARNING | Command SENT but no ACK within timeout |
| Any from Pi | As published | Forwarded directly from `lighttrack/events` |

---

## 15. Docker

Build and run locally:

```bash
docker build -t lighttrack-api .
docker run --env-file .env -p 3001:3001 lighttrack-api
```

Or using Docker Compose:

```bash
docker compose up
```

The Compose file uses the `.env` file for environment variables and includes a health check on `GET /health`.

---

## 16. Railway Deployment

1. Push the repository to GitHub
2. Create a new Railway project, link the repository
3. Set all required environment variables in the Railway dashboard (never commit secrets)
4. Railway builds using the `Dockerfile` automatically
5. The `railway.toml` configures health check and restart policy

The health check path is `GET /health`. Railway restarts the service on failure with up to 3 retries.

---

## 17. GitHub Actions CI

Defined in `.github/workflows/backend-ci.yml`.

Runs on every push to `main` or `develop` and on pull requests to `main`:

1. `npm ci` — install exact dependency versions
2. `npm run lint` — runs `tsc --noEmit`, catches all TypeScript errors
3. `npm run build` — compiles to `dist/`

No secrets are needed in CI since the build does not connect to any external services.

---

## 18. Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` lives only in this backend's environment
- MQTT credentials live only in this backend and the Raspberry Pi gateway
- The frontend receives neither of the above
- CORS is restricted to `CORS_ORIGIN` origins only
- All REST endpoints except `/health` require a valid Supabase JWT
- Rate limiting is applied to all `/api/*` routes (100 req / 15 min per IP by default)
- Helmet sets security HTTP headers
- All MQTT payloads are validated with Zod before any database insert
- All REST request bodies are validated with Zod before processing
- Secrets are never logged (Authorization headers, passwords, service role key)
- Stack traces are never returned in production responses

---

## 19. Troubleshooting

### MQTT does not connect

- Check `MQTT_BROKER_URL` format: must be `mqtts://hostname:8883`
- Verify `MQTT_USERNAME` and `MQTT_PASSWORD` are correct for the backend user
- In development, if TLS cert is self-signed, set `NODE_ENV=development` (disables `rejectUnauthorized`)
- Check broker firewall allows port 8883 from Railway IP ranges

### Supabase queries fail

- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Ensure tables exist (run migrations from `src/migrations/solar_schedule.sql`)
- Check Supabase project is not paused (free tier pauses after inactivity)

### Sun schedule returns 502

- Open-Meteo is unreachable or returned an error
- Check `LOCATION_LAT` and `LOCATION_LON` are valid coordinates
- The `solar_schedule` table may be empty — wait for the 05:00 job or restart the server (it will try on first request)

### Commands stay in PENDING

- MQTT publish failed — check MQTT broker connectivity
- The `commandService` marks commands FAILED when publish throws
- Check logs for `MQTT publish failed for command`

### Commands stay in SENT

- Raspberry Pi is not receiving or not ACK-ing
- Command timeout job runs every 30s and marks them FAILED after 10s
- Check `system_events` for `COMMAND_TIMEOUT` entries

### Device shows offline incorrectly

- Check `DEVICE_OFFLINE_AFTER_SECONDS` — default is 90s
- Raspberry Pi telemetry must arrive at least once every 90s
- If Pi is offline intentionally, this is correct behavior

### TypeScript build fails

```bash
npm run lint   # shows all type errors
npm run build  # compiles to dist/
```

Fix all errors before deploying. The CI pipeline will block merges if lint fails.

### Local development

```bash
cp .env.example .env
# fill in .env values
npm install
npm run dev    # starts with nodemon, watches src/
```
