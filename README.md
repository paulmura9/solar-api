# LightTrack Backend API

REST and WebSocket backend for LightTrack, a dual-axis solar tracking system with camera-based dirt detection on the panel surface. This service is the central server component of a bachelor's thesis project: it ingests telemetry from the field hardware, relays commands back to the device, processes vision results, and exposes the collected data to a web dashboard.

## Tech Stack

- Node.js (>= 22) with Express
- TypeScript (strict)
- Zod for request and message validation
- WebSocket via the `ws` library
- Supabase (PostgreSQL) for persistence
- Resend for email notifications
- Deployed on Railway

## Communication Map

### `/ws/device` — Raspberry Pi gateway

WebSocket endpoint used by the Raspberry Pi gateway. The connection is authenticated with a device API key and an expected device ID during the HTTP upgrade. Telemetry, vision results, command acknowledgements, and heartbeats arrive on this socket; pending commands are pushed back out to the gateway over the same connection.

### `/ws/client` — dashboard

WebSocket endpoint used by the dashboard. The upgrade is authenticated with a Supabase JWT. Clients connected here receive live updates (telemetry, device status, vision results) as they are pushed by the backend.

### REST API — dashboard

The Next.js dashboard reads data over an HTTP REST API. Routes are grouped under `/api` and cover readings, commands, vision, camera, events, devices, energy, and dashboard summaries, plus a `/health` endpoint. REST requests for `/api` routes are rate limited and authenticated with a Supabase JWT.

### Supabase

Supabase PostgreSQL stores telemetry readings and vision results, along with device status, commands, and system events. The backend connects with the service role key.

### Resend

Resend sends email notifications (for example, panel cleaning alerts). It is optional: if the Resend API key or recipient address is not configured, the notification is skipped rather than sent.

## Data Flow

ESP32 -> Pi gateway (MQTT) -> this backend (WebSocket) -> dashboard + Supabase

## Main Responsibilities

- Telemetry ingestion and validation from the device gateway
- Command relay from the dashboard to the device
- Vision result processing (dirt detection output)
- History and summary endpoints for the dashboard

## Running Locally

Install dependencies:

```
npm install
```

Set the required environment variables (a `.env` file is loaded at startup). The values are not listed here:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGIN`
- `LOCATION_LAT`
- `LOCATION_LON`
- `DEVICE_API_KEY`
- `EXPECTED_DEVICE_ID`

Optional, for email notifications:

- `RESEND_API_KEY`
- `ALERT_EMAIL_TO`
- `ALERT_EMAIL_FROM`

`PORT` and `NODE_ENV` are optional and have defaults. Additional optional variables tune command timeouts, device-offline detection, rate limits, and WebSocket behavior; see `src/config/env.ts` for the full list.

Start the development server (watches `src` and restarts on change):

```
npm run dev
```

## Deployment

Deployed on Railway.
