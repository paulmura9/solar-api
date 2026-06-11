# LightTrack Backend API Reference

Base URL (production): `https://your-railway-app.up.railway.app`  
Base URL (local): `http://localhost:3001`

---

## Authentication

Every endpoint except `GET /health` requires a valid Supabase JWT.

Obtain the token from Supabase Auth after signing in with the frontend. Pass it in every request as:

```
Authorization: Bearer <supabase-jwt>
```

If the header is missing, malformed, or the token is invalid or expired the API returns `401`.

---

## Rate Limiting

All `/api/*` routes share a rate limit window. Default: **100 requests per 15 minutes** per IP. Exceeding the limit returns `429`.

---

## Common Error Responses

These apply to every endpoint:

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "Invalid query parameters", "details": {...} }` | Query param failed validation |
| `400` | `{ "error": "Validation failed", "details": {...} }` | Request body failed validation |
| `401` | `{ "error": "Missing or invalid authorization header" }` | No Bearer token |
| `401` | `{ "error": "Invalid token" }` | Token rejected by Supabase |
| `404` | `{ "error": "Not found" }` | Route does not exist |
| `429` | `{ "error": "Too many requests, please try again later" }` | Rate limit exceeded |
| `500` | `{ "error": "Internal server error" }` | Unhandled server error |

---

## Endpoints

---

### GET /health

Returns the API liveness status. No authentication required.

**Authentication:** No

**Query parameters:** None

**Response — 200**

```json
{
  "status": "ok",
  "service": "lighttrack-api",
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok"` | Always `"ok"` when the server is reachable |
| `service` | `string` | Service identifier |
| `timestamp` | `string` | ISO 8601 UTC timestamp of the response |

**No authentication errors apply to this endpoint.**

---

### GET /api/readings/latest

Returns the single most recent row from `sensor_readings`.

**Authentication:** Yes

**Query parameters:** None

**Response — 200**

```json
{
  "data": {
    "id": 4201,
    "timestamp": "2026-05-12T14:29:55.000Z",
    "horizontal_angle": 112,
    "vertical_angle": 47,
    "tracking_mode": "AUTO",
    "is_moving": false,
    "ldr_top_left": 2860,
    "ldr_top_right": 2850,
    "ldr_bottom_left": 2800,
    "ldr_bottom_right": 2810,
    "horizontal_light_difference": 10,
    "vertical_light_difference": 30,
    "battery_voltage": 7.82,
    "battery_percent": 65,
    "battery_status": "CHARGING",
    "solar_voltage": 18.24,
    "solar_current": 0.581,
    "solar_power": 10.59,
    "solar_energy_today_wh": 142.4,
    "charging_voltage": 7.81,
    "charging_current": 0.521,
    "charging_power": 4.07,
    "charged_energy_today_wh": 128.6,
    "ambient_light_lux": 52400,
    "created_at": "2026-05-12T14:29:55.123Z"
  },
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

`data` is `null` when no readings exist yet.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `integer` | Auto-increment primary key |
| `timestamp` | `string` | ISO 8601, when the reading was recorded by the device |
| `horizontal_angle` | `integer` | Panel horizontal position, 0–180 degrees |
| `vertical_angle` | `integer` | Panel vertical position, 0–180 degrees |
| `tracking_mode` | `"AUTO" \| "MANUAL" \| "IDLE" \| "ERROR"` | Current tracker operating mode |
| `is_moving` | `boolean` | Whether servos are actively moving |
| `ldr_top_left` | `integer \| null` | LDR sensor ADC reading, 0–4095 |
| `ldr_top_right` | `integer \| null` | LDR sensor ADC reading, 0–4095 |
| `ldr_bottom_left` | `integer \| null` | LDR sensor ADC reading, 0–4095 |
| `ldr_bottom_right` | `integer \| null` | LDR sensor ADC reading, 0–4095 |
| `horizontal_light_difference` | `integer \| null` | Left minus right LDR difference, can be negative |
| `vertical_light_difference` | `integer \| null` | Top minus bottom LDR difference, can be negative |
| `battery_voltage` | `number` | Pack voltage in volts (2S 18650, 6.6–8.4 V nominal) |
| `battery_percent` | `integer \| null` | Estimated state of charge, 0–100 |
| `battery_status` | `"CHARGING" \| "DISCHARGING" \| "NORMAL" \| "FULL" \| "LOW" \| "CRITICAL" \| "IDLE" \| "UNKNOWN" \| null` | Inferred charge state |
| `solar_voltage` | `number \| null` | Panel output voltage in volts |
| `solar_current` | `number \| null` | Panel current in amperes |
| `solar_power` | `number \| null` | Instantaneous panel power in watts |
| `solar_energy_today_wh` | `number \| null` | Accumulated panel energy today in Wh |
| `charging_voltage` | `number \| null` | MPPT output voltage in volts |
| `charging_current` | `number \| null` | MPPT output current in amperes |
| `charging_power` | `number \| null` | Charging power in watts |
| `charged_energy_today_wh` | `number \| null` | Net energy into the battery today in Wh (charge minus load on the shared rail, as measured by the battery-side INA219), not gross MPPT-delivered energy |
| `ambient_light_lux` | `number \| null` | Ambient light level in lux |
| `created_at` | `string` | ISO 8601, database insert timestamp |

**Error responses**

| Status | Cause |
|--------|-------|
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/readings/history

Returns a paginated list of sensor readings ordered by timestamp descending.

**Authentication:** Yes

**Query parameters**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `integer` | `100` | `1000` | Number of rows to return |
| `offset` | `integer` | `0` | — | Number of rows to skip |
| `start_date` | `string (YYYY-MM-DD)` | — | — | Filter: readings on or after this date |
| `end_date` | `string (YYYY-MM-DD)` | — | — | Filter: readings on or before this date |

**Response — 200**

```json
{
  "data": [
    {
      "id": 4201,
      "timestamp": "2026-05-12T14:29:55.000Z",
      "horizontal_angle": 112,
      "vertical_angle": 47,
      "tracking_mode": "AUTO",
      "is_moving": false,
      "ldr_top_left": 2860,
      "ldr_top_right": 2850,
      "ldr_bottom_left": 2800,
      "ldr_bottom_right": 2810,
      "horizontal_light_difference": 10,
      "vertical_light_difference": 30,
      "battery_voltage": 7.82,
      "battery_percent": 65,
      "battery_status": "CHARGING",
      "solar_voltage": 18.24,
      "solar_current": 0.581,
      "solar_power": 10.59,
      "solar_energy_today_wh": 142.4,
      "charging_voltage": 7.81,
      "charging_current": 0.521,
      "charging_power": 4.07,
      "charged_energy_today_wh": 128.6,
      "ambient_light_lux": 52400,
      "created_at": "2026-05-12T14:29:55.123Z"
    }
  ],
  "total": 4201,
  "limit": 100,
  "offset": 0,
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | `array` | Reading objects — same fields as `/api/readings/latest` |
| `total` | `integer` | Total matching rows (used for pagination) |
| `limit` | `integer` | Echo of the applied limit |
| `offset` | `integer` | Echo of the applied offset |
| `timestamp` | `string` | ISO 8601 response timestamp |

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | `limit` or `offset` out of range; `start_date` / `end_date` not a valid date string |
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/events

Returns recent system events ordered by timestamp descending.

**Authentication:** Yes

**Query parameters**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `integer` | `20` | `100` | Number of events to return |
| `severity` | `string` | — | — | Comma-separated severity filter, e.g. `WARNING,ERROR,CRITICAL` |

**Response — 200**

```json
{
  "data": [
    {
      "id": 312,
      "timestamp": "2026-05-12T13:55:00.000Z",
      "event_type": "BATTERY_LOW",
      "severity": "WARNING",
      "message": "Estimated battery level below 20%",
      "created_at": "2026-05-12T13:55:00.123Z"
    }
  ],
  "total": 1,
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `integer` | Auto-increment primary key |
| `timestamp` | `string` | ISO 8601, when the event occurred |
| `event_type` | `string` | One of the event type constants listed below |
| `severity` | `"INFO" \| "WARNING" \| "ERROR" \| "CRITICAL"` | Severity level |
| `message` | `string` | Human-readable description |
| `created_at` | `string` | ISO 8601, database insert timestamp |

**Known event types:** `BATTERY_LOW`, `BATTERY_HIGH`, `CLEANING_REQUIRED`, `CLEANING_TRIGGERED`, `TRACKING_STARTED`, `TRACKING_STOPPED`, `TRACKING_MODE_CHANGED`, `SENSOR_ERROR`, `CAMERA_ERROR`, `ESP32_OFFLINE`, `RASPBERRY_PI_OFFLINE`, `DEVICE_OFFLINE`, `MQTT_DISCONNECTED`, `MQTT_CONNECTED`, `COMMAND_TIMEOUT`, `COMMAND_FAILED`, `SUN_POSITION_UPDATE`, `WEATHER_CHANGED`

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | `limit` out of range |
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/devices

Returns the current status of all hardware components.

**Authentication:** Yes

**Query parameters:** None

**Response — 200**

```json
{
  "data": [
    {
      "id": 1,
      "device_name": "ESP32",
      "is_online": true,
      "last_seen": "2026-05-12T14:29:55.000Z",
      "firmware_version": "v1.2.3",
      "status_message": "Tracking active, all sensors OK",
      "updated_at": "2026-05-12T14:29:55.123Z"
    },
    {
      "id": 2,
      "device_name": "RASPBERRY_PI",
      "is_online": true,
      "last_seen": "2026-05-12T14:29:58.000Z",
      "firmware_version": null,
      "status_message": "Gateway running",
      "updated_at": "2026-05-12T14:29:58.000Z"
    }
  ],
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `integer` | Auto-increment primary key |
| `device_name` | `"ESP32" \| "RASPBERRY_PI" \| "MQTT_BROKER" \| "CAMERA" \| "INA219"` | Device identifier |
| `is_online` | `boolean` | Whether the device is currently considered online |
| `last_seen` | `string \| null` | ISO 8601 timestamp of last received message or heartbeat |
| `firmware_version` | `string \| null` | Reported firmware version string |
| `status_message` | `string \| null` | Human-readable status from the device |
| `updated_at` | `string` | ISO 8601, last time this row was written |

**Error responses**

| Status | Cause |
|--------|-------|
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/vision/latest

Returns the single most recent dirt detection result.

**Authentication:** Yes

**Query parameters:** None

**Response — 200**

```json
{
  "data": {
    "id": 87,
    "timestamp": "2026-05-12T14:00:00.000Z",
    "dirt_level_percent": 8.2,
    "cleanliness_percent": 91.8,
    "cleaning_required": false,
    "confidence": 0.94,
    "image_path": "raw/2026-05-12/image_140000.jpg",
    "processed_image_path": "processed/2026-05-12/mask_140000.jpg",
    "created_at": "2026-05-12T14:00:00.412Z"
  },
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

`data` is `null` when no vision results exist yet.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `integer` | Auto-increment primary key |
| `timestamp` | `string` | ISO 8601, when the image was captured |
| `dirt_level_percent` | `number` | Detected dirt coverage, 0–100 |
| `cleanliness_percent` | `number` | Inverse of dirt level, 0–100 |
| `cleaning_required` | `boolean` | Whether the model recommends cleaning |
| `confidence` | `number \| null` | Model confidence score, 0–1 |
| `image_path` | `string \| null` | Storage path to the raw camera image |
| `processed_image_path` | `string \| null` | Storage path to the annotated/masked image |
| `created_at` | `string` | ISO 8601, database insert timestamp |

**Error responses**

| Status | Cause |
|--------|-------|
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/vision/history

Returns a list of dirt detection results ordered by timestamp descending.

**Authentication:** Yes

**Query parameters**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `integer` | `50` | `200` | Number of results to return |
| `start_date` | `string (YYYY-MM-DD)` | — | — | Filter: results on or after this date |
| `end_date` | `string (YYYY-MM-DD)` | — | — | Filter: results on or before this date |

**Response — 200**

```json
{
  "data": [
    {
      "id": 87,
      "timestamp": "2026-05-12T14:00:00.000Z",
      "dirt_level_percent": 8.2,
      "cleanliness_percent": 91.8,
      "cleaning_required": false,
      "confidence": 0.94,
      "image_path": "raw/2026-05-12/image_140000.jpg",
      "processed_image_path": "processed/2026-05-12/mask_140000.jpg",
      "created_at": "2026-05-12T14:00:00.412Z"
    }
  ],
  "total": 87,
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | `array` | Vision result objects — same fields as `/api/vision/latest` |
| `total` | `integer` | Total matching rows |
| `timestamp` | `string` | ISO 8601 response timestamp |

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | `limit` out of range; `start_date` / `end_date` not a valid date string |
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### GET /api/commands

Returns recent device commands ordered by created_at descending.

**Authentication:** Yes

**Query parameters**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `integer` | `10` | `100` | Number of commands to return |
| `status` | `string` | — | — | Comma-separated status filter, e.g. `PENDING,SENT` |

**Response — 200**

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "command_type": "SET_MODE",
      "payload": { "mode": "AUTO" },
      "status": "ACKNOWLEDGED",
      "error_message": null,
      "created_at": "2026-05-12T14:28:00.000Z",
      "sent_at": "2026-05-12T14:28:00.341Z",
      "acknowledged_at": "2026-05-12T14:28:01.892Z"
    }
  ],
  "total": 1,
  "timestamp": "2026-05-12T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Command UUID |
| `command_type` | `string` | One of the command type constants listed below |
| `payload` | `object` | Command-specific parameters |
| `status` | `"PENDING" \| "SENT" \| "ACKNOWLEDGED" \| "FAILED"` | Lifecycle state |
| `error_message` | `string \| null` | Set when status is `FAILED` |
| `created_at` | `string` | ISO 8601, when the command was created |
| `sent_at` | `string \| null` | ISO 8601, when the command was published to MQTT |
| `acknowledged_at` | `string \| null` | ISO 8601, when the ESP32 confirmed execution |

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | `limit` out of range |
| `401` | Missing or invalid JWT |
| `500` | Supabase query failure |

---

### POST /api/commands

Creates a new command and dispatches it to the ESP32 via MQTT.

**Authentication:** Yes

**Request body** (`Content-Type: application/json`)

```json
{
  "command_type": "SET_MODE",
  "payload": { "mode": "AUTO" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command_type` | `string` | Yes | Must be one of the command type constants listed below |
| `payload` | `object` | No | Command-specific parameters (defaults to `{}`) |

**Supported command types and their payloads**

| `command_type` | `payload` fields |
|----------------|-----------------|
| `SET_MODE` | `{ "mode": "AUTO" \| "MANUAL" \| "IDLE" }` |
| `MOVE_PANEL` | `{ "h_angle": integer, "v_angle": integer }` |
| `RESET_POSITION` | `{}` |
| `REQUEST_STATUS` | `{}` |
| `START_TRACKING` | `{}` |
| `STOP_TRACKING` | `{}` |

**Response — 201**

```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "command_type": "SET_MODE",
    "payload": { "mode": "AUTO" },
    "status": "SENT",
    "error_message": null,
    "created_at": "2026-05-12T14:28:00.000Z",
    "sent_at": "2026-05-12T14:28:00.341Z",
    "acknowledged_at": null
  },
  "timestamp": "2026-05-12T14:28:00.341Z"
}
```

The response `status` reflects the state at the moment of the HTTP response:

- `SENT` — command was persisted and successfully published to MQTT
- `FAILED` — command was persisted but MQTT publish failed (broker unreachable or not configured)

The command transitions to `ACKNOWLEDGED` or `FAILED` asynchronously after the ESP32 responds. Poll `GET /api/commands` to observe the final status.

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | `command_type` is not a recognised value |
| `401` | Missing or invalid JWT |
| `500` | Supabase insert failure |

---

## Field Names Reference

All API responses use snake_case field names throughout.

### /api/readings/latest · /api/readings/history

```
id
timestamp
horizontal_angle
vertical_angle
tracking_mode
is_moving
ldr_top_left
ldr_top_right
ldr_bottom_left
ldr_bottom_right
horizontal_light_difference
vertical_light_difference
battery_voltage
battery_percent
battery_status
solar_voltage
solar_current
solar_power
solar_energy_today_wh
charging_voltage
charging_current
charging_power
charged_energy_today_wh
ambient_light_lux
created_at
```

### /api/events

```
id
timestamp
event_type
severity
message
created_at
```

### /api/devices

```
id
device_name
is_online
last_seen
firmware_version
status_message
updated_at
```

### /api/vision/latest · /api/vision/history

```
id
timestamp
dirt_level_percent
cleanliness_percent
cleaning_required
confidence
image_path
processed_image_path
created_at
```

### /api/commands (GET and POST)

```
id
command_type
payload
status
error_message
created_at
sent_at
acknowledged_at
```

### /health

```
status
service
timestamp
```
