# LightTrack Backend API

REST and WebSocket backend for LightTrack, a dual-axis solar tracking system with camera-based dirt detection on the panel surface. This service is the cloud backend of a bachelor's thesis project: it ingests telemetry from the field hardware, relays commands back to the device, processes vision results, sends cleaning alerts, and exposes the collected data to a web dashboard.

## System Context

LightTrack has four layers, each a separate project:

- ESP32 — reads light sensors, drives the servos, talks to the gateway over local MQTT.
- Raspberry Pi gateway — bridges the ESP32 (MQTT) to this backend (WebSocket) and runs the vision pipeline.
- This backend — Express on Railway, the only component that writes to Supabase.
- Next.js dashboard — reads and controls the system over REST and a live WebSocket.

This repository is only the backend. It is the authoritative writer: the Pi does not write to the database directly, every state change goes through this service using the Supabase service role key.

## Tech Stack

- Node.js (>= 22) with Express
- TypeScript (strict)
- Zod for request and message validation
- WebSocket via the `ws` library
- Supabase (PostgreSQL, Auth, Storage) for persistence
- Resend for email notifications
- Deployed on Railway

## Communication Map

### `/ws/device` — Raspberry Pi gateway

WebSocket endpoint for the Raspberry Pi gateway. The connection is authenticated during the HTTP upgrade by the `X-Device-Key` and `X-Device-Id` headers: the key is compared in constant time, and the id must match the single expected device. The gateway sends telemetry, command acknowledgements, ESP32 events, vision results, camera-capture results, and heartbeats; the backend pushes commands down the same connection. On reconnect the gateway sends a sync request, and the backend re-dispatches commands that are still pending so nothing is lost while the gateway was offline.

### `/ws/client` — dashboard

WebSocket endpoint for the dashboard. The upgrade is authenticated with a Supabase JWT carried in the `access_token` WebSocket subprotocol. Connected clients receive live broadcasts (telemetry, device status, vision results, command updates). Because the socket is long-lived, the client can send a `reauth` message with a refreshed token before its JWT expires.

### REST API — dashboard

The Next.js dashboard reads data over an HTTP REST API. Routes under `/api` cover readings, commands, vision, camera, events, devices, energy, and dashboard summaries; `/health` and `/metrics` sit outside `/api`. The `/api` routes are JWT-authenticated and rate limited (per user when a bearer token is present, otherwise per IP).

### Supabase

Supabase PostgreSQL stores telemetry readings, vision results, device commands, device status, and system events. The backend connects with the service role key and is the only writer. Auth is used to verify dashboard JWTs; Storage holds the panel images uploaded by the gateway.

### Resend

When the vision pipeline detects that the panel has crossed into a "needs cleaning" state, the backend sends a cleaning-alert email through Resend to all registered users (falling back to `ALERT_EMAIL_TO` if none can be listed). It is best-effort and fail-safe: if `RESEND_API_KEY` is not configured the alert is skipped, and a failed send never blocks saving the vision result.

## Data Flow

ESP32 -> Pi gateway (MQTT) -> this backend (WebSocket) -> dashboard + Supabase

## Main Responsibilities

- Telemetry ingestion and validation from the gateway
- Command relay to the device, with status lifecycle (pending, sent, acknowledged, failed on timeout)
- Vision and camera-capture result processing, including cleaning alerts
- Device online/offline tracking
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
- `DEVICE_API_KEY`
- `EXPECTED_DEVICE_ID`

Optional, for cleaning-alert email:

- `RESEND_API_KEY`
- `ALERT_EMAIL_TO`
- `ALERT_EMAIL_FROM`

`PORT` and `NODE_ENV` are optional and have defaults. Further optional variables tune command timeouts, device-offline detection, rate limits, and WebSocket heartbeat and reconnect behavior; see `src/config/env.ts` for the full list.

Start the development server (watches `src` and restarts on change):

```
npm run dev
```

## Deployment

Deployed on Railway.
