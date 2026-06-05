# AUDIT — Battery & MPPT-Charging Data (Backend)

Audit-only. No source files modified. Every claim cites `file:line`.

Architecture note: the running backend ingests telemetry over a **WebSocket
`/ws/device`** path (`src/ws/deviceHandlers/telemetry.ts`), not the Supabase
Realtime / MQTT model described in `CLAUDE.md`. The audit reflects the code as
it actually exists.

## 1. Telemetry ingestion & Zod validation

Validation schema: `telemetryPayloadSchema` in `src/ws/schemas.ts:46-77`
(`.strict()` object — unknown keys rejected). Range constants defined at
`src/ws/schemas.ts:24-32` and `src/utils/constants.ts:21-22`.

| Field | Validated? | Required / Optional | Range / Enum enforced | Cite |
|---|---|---|---|---|
| `battery_voltage` | Yes | Optional, nullable (dropped if missing) | number, min 0 max 20 (`BATTERY_VOLTAGE_MIN/MAX`) | `schemas.ts:24-25,61` |
| `battery_percent` | Yes | Optional, nullable (dropped if missing) | number, min 0 max 100 (`BATTERY_PERCENT_MIN/MAX`) | `schemas.ts:62`; `constants.ts:21-22` |
| `battery_status` | Yes | Optional, nullable (dropped if missing) | enum: CHARGING, DISCHARGING, NORMAL, FULL, LOW, CRITICAL, IDLE, UNKNOWN | `schemas.ts:63`; `constants.ts:2` |
| `charging_voltage` | Yes | Optional, nullable (dropped if missing) | number, min 0 max 30 (`SOLAR_VOLTAGE_MAX`) | `schemas.ts:26,70` |
| `charging_current` | Yes | Optional, nullable (dropped if missing) | number, min 0 max 10 (`SOLAR_CURRENT_MAX`) | `schemas.ts:27,71` |
| `charging_power` | Yes | Optional, nullable (dropped if missing) | number, min 0 max 300 (`SOLAR_POWER_MAX`) | `schemas.ts:28,72` |
| `charged_energy_today_wh` | Yes | Optional, nullable (dropped if missing) | number, min 0 (no max) | `schemas.ts:73` |

Notes:
- All seven fields use `.nullable().optional()` — none is required. A packet
  with all of them absent still validates (`schemas.ts:61-73`).
- On validation failure the whole packet is rejected and a `SENSOR_ERROR`
  event is written; no row is inserted (`telemetry.ts:10-18`).
- `charging_*` reuse the `SOLAR_*` bounds. Unlike `solar_current`/`solar_power`
  (which allow a small negative deadband, `schemas.ts:31-32,66-67`), the
  `charging_*` fields enforce `min(0)` — negative charging values are rejected
  (`schemas.ts:70-72`).

---

## 2. Persistence to `sensor_readings`

Write path: `insertTelemetry` in `src/services/telemetryService.ts:36-66`
(plain `.insert(row)`).

| Column | Written? | Value source | Cite |
|---|---|---|---|
| `battery_voltage` | Yes | Pass-through, raw `payload.battery_voltage` (**no `?? null` fallback**) | `telemetryService.ts:51` |
| `battery_percent` | Yes | Pass-through, `payload.battery_percent ?? null` | `telemetryService.ts:52` |
| `battery_status` | Yes | Pass-through, `payload.battery_status ?? null` | `telemetryService.ts:53` |
| `charging_voltage` | Yes | Pass-through, `?? null` | `telemetryService.ts:60` |
| `charging_current` | Yes | Pass-through, `?? null` | `telemetryService.ts:61` |
| `charging_power` | Yes | Pass-through, `?? null` | `telemetryService.ts:62` |
| `charged_energy_today_wh` | Yes | Pass-through, `?? null` | `telemetryService.ts:63` |

- **`battery_percent` is taken as-is from the ESP32. There is no server-side
  recomputation, formula, or thresholding** anywhere in the codebase
  (`telemetryService.ts:52`; no other write site exists — grep confirmed only
  `schemas.ts`, `telemetryService.ts`, `readings.controller.ts`,
  `dashboard.controller.ts`, `energyCalc.ts` reference these fields).
- **`battery_status` is passed through, not derived** (`telemetryService.ts:53`).
- Inconsistency (not a behavior change, but worth flagging): `battery_voltage`
  is written without a `?? null` fallback while every sibling field has one
  (`telemetryService.ts:51` vs `52-63`). The schema marks it
  `.nullable().optional()` (`schemas.ts:61`), so a missing value writes
  `undefined`. The returned DTO type also declares `batteryVoltage: number`
  (non-nullable) (`telemetryService.ts:21`) and `ReadingResponse.battery_voltage:
  number` (`readings.controller.ts:20`), contradicting the nullable schema.

---

## 3. Charged-energy logic (integration of power over time)

**There is NO server-side integration of charging power over time.** No
`power * dt`, no accumulator, no day-rollover logic exists in the backend.

- `charged_energy_today_wh` is only ever stored verbatim from the device
  (`telemetryService.ts:63`) and read back.
- `energyCalc.getEnergySummary` (`src/services/energyCalc.ts:6-53`) does **not**
  integrate power. It treats `charged_energy_today_wh` as a device-provided
  daily accumulator and aggregates it: groups rows by calendar day and takes
  the daily **maximum** per day, then sums those daily maxima
  (`energyCalc.ts:28-40`). `totalDeliveredWh` = sum of daily-max
  `charged_energy_today_wh` (`energyCalc.ts:34,36,40`); `totalGeneratedWh` =
  sum of daily-max `solar_energy_today_wh` (`energyCalc.ts:33,35,39`).
- This is aggregation of an externally-supplied accumulator, **not** computation
  of charged energy from `charging_power`. `charging_power` is not used in any
  energy calculation (grep: `charging_power` appears only in `schemas.ts`,
  `telemetryService.ts`, `readings.controller.ts`, `dashboard.controller.ts`,
  `docs/API.md`).

---

## 4. REST endpoints returning battery/charging fields

All `/api/*` routes require JWT (`routes/readings.ts:12`, `routes/energy.ts:11`,
`routes/dashboard.ts:9`). Routers are mounted in `src/app.ts:62,68,69` despite
the `// unused — removal candidate` comments on their controllers.

| Endpoint | Returns battery/charging fields | Cite |
|---|---|---|
| `GET /api/readings/latest` | `battery_voltage, battery_percent, battery_status, charging_voltage, charging_current, charging_power, charged_energy_today_wh` (full pass-through via `rowToResponse`) | `readings.controller.ts:35-92`; select list `65-73` |
| `GET /api/readings/history` | Same full set, per row | `readings.controller.ts:94-125`; `SELECT_FIELDS:65-73` |
| `GET /api/dashboard/summary` | `latestReading` includes all battery+charging columns | `dashboard.controller.ts:15-17` |
| `GET /api/readings/stats` | Only `battery_voltage` (min/max/avg). No `battery_percent`, `battery_status`, or any `charging_*` | `readings.controller.ts:128-161`; route `routes/readings.ts:17` |
| `GET /api/energy/summary` | `charged_energy_today_wh` only indirectly, as `totalDeliveredWh` aggregate; no raw battery/charging fields, no `battery_percent`/`battery_status` | `energyCalc.ts:34-52`; `types/energy.ts:1-7` |
| `GET /api/energy/dirt-impact` | None | `energyCalc.ts:55-84`; `types/energy.ts:9-13` |

No endpoint returns a server-derived `battery_percent`, `battery_status`, or a
server-computed `charged_energy_today_wh`; all are echoes of stored device values.

---

## 5. Dead / placeholder / misleading code tied to battery/charging

| Item | Observation | Cite |
|---|---|---|
| `getReadingStats` | Marked `// unused — removal candidate` but route IS mounted at `/api/readings/stats`. Computes battery_voltage stats. | `readings.controller.ts:127-128`; `routes/readings.ts:16-17`; `app.ts:62` |
| `energy.controller` / `energyCalc` | Files headed `// unused — removal candidate`, yet `/api/energy/*` IS mounted. | `controllers/energy.controller.ts:1`; `app.ts:68` |
| `dashboard.controller` | Headed `// unused — removal candidate`, yet `/api/dashboard/summary` IS mounted. | `dashboard.controller.ts:1`; `app.ts:69` |
| `battery_voltage` DTO typing | DTO/response declare it non-nullable `number` while schema allows null/absent and the writer omits the `?? null` fallback — latent type mismatch, no runtime coercion. | `telemetryService.ts:21,51`; `readings.controller.ts:20,49`; `schemas.ts:61` |
| No `TODO`/`FIXME` | No battery/charging TODO/FIXME/placeholder markers in source (grep). The only "placeholder" hit is in `BACKEND_SECURITY_AUDIT.md`, unrelated. | grep `TODO\|FIXME\|placeholder` |
| `docs/API.md` enum drift | Docs list `battery_status` enum as `CHARGING\|DISCHARGING\|IDLE\|LOW\|UNKNOWN`, but code enforces 8 values incl. `NORMAL, FULL, CRITICAL`. Documentation only, no code effect. | `docs/API.md:137` vs `constants.ts:2` |

---

## Gaps — schema/enum supports it, backend does NOT produce/store it

1. **Server-derived `battery_percent`** — backend never computes state-of-charge
   from `battery_voltage`. It only stores whatever the ESP32 sends; if the device
   omits it, the column is `null`. (`telemetryService.ts:52`)
2. **Server-derived `battery_status`** — never inferred from voltage/current/charging
   state. Pass-through only; `null` if device omits it. The 8-value enum
   (`constants.ts:2`) is enforced on input but no value is ever generated server-side.
   (`telemetryService.ts:53`)
3. **Computed `charged_energy_today_wh`** — no integration of `charging_power` over
   time and no day-rollover accumulator. If the device never sends this field, it
   stays `null` and `totalDeliveredWh`/`efficiencyPercent` compute from zeros — the
   backend cannot reconstruct it from `charging_power`. (`energyCalc.ts:34,40,43-44`)
4. **`battery_voltage` null-safety** — schema permits null/missing, but the writer
   passes the raw value with no fallback and the DTO types it as non-nullable; the
   "guaranteed number" contract is not actually enforced anywhere.
   (`schemas.ts:61`; `telemetryService.ts:51,21`)
5. **`charging_*` exposure in aggregates** — `charging_voltage`, `charging_current`,
   `charging_power` are validated, stored, and returned raw by readings/dashboard,
   but no endpoint derives or summarizes them (e.g., average charging power, charge
   efficiency); only the device's own `charged_energy_today_wh` accumulator is
   aggregated. (`energyCalc.ts:9-13`)
