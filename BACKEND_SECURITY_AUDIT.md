# LightTrack Backend - Security Audit Report

**Date:** 2026-05-13
**Auditor:** Claude Sonnet 4.6
**Scope:** Express + TypeScript backend deployed on Railway, Supabase PostgreSQL, Node.js 22
**Commit audited:** e89cbaf

---

## Summary Table

| ID | Point | Finding | Severity | Status |
|----|-------|---------|----------|--------|
| F1.1 | Rate limiting | Command limiter keyed by IP, not authenticated user ID | High | Resolved 2026-05-13 |
| F1.2 | Rate limiting | In-memory store resets on restart, no cross-instance sync | Medium | Deferred |
| F1.3 | Rate limiting | Global 100/15min limit too low for a polling dashboard | Informational | Accepted |
| F2.1 | Zod validation | `status` filter in command queries accepts any string | Low | Resolved 2026-05-13 |
| F2.2 | Zod validation | `severity` filter in events queries accepts any string | Low | Resolved 2026-05-13 |
| F3.1 | CORS | `credentials: true` not needed for Bearer-token auth | Low | Resolved 2026-05-13 |
| F4.1 | Helmet | `x-frame-options: SAMEORIGIN` instead of `DENY` | Low | Resolved 2026-05-13 |
| F4.2 | Helmet | `cross-origin-resource-policy: same-origin` on a cross-origin API | Low | Resolved 2026-05-13 |
| F5.1 | JWT verification | Correct: `auth.getUser()` is full server-side validation | No Issue | - |
| F5.4 | JWT verification | `AuthRetryableFetchError` returns 401 instead of 503, not logged | Medium | Resolved 2026-05-13 |
| F6.1 | Error handling | No `process.on('unhandledRejection')` - crash risk in Node 22 | High | Resolved 2026-05-13 |
| F6.2 | Error handling | No correlation ID in 500 responses | Medium | Resolved 2026-05-13 |
| F6.5 | Error handling | `HttpError.details` sent to client in all environments | Low | Resolved 2026-05-13 |
| F7.4 | Logging | `JSON.stringify` in `serializeErr` has no circular-reference guard | Low | Resolved 2026-05-13 |
| F7.5 | Logging | `req.originalUrl` logs query string (future risk) | Low | Accepted |
| F8.1 | Key hygiene | Service role key never committed to git | No Issue | - |
| F8.2 | Key hygiene | Key used in exactly 2 files (env.ts, supabase.ts) | No Issue | - |

---

## POINT 1 - Rate Limiting

### What was checked

- `src/app.ts` lines 32-40: global `apiLimiter`
- `src/routes/commands.ts` lines 13-21: `commandLimiter`
- `src/config/env.ts`: defaults for rate limit settings

### Current configuration

```
Global limiter (app.ts):
  windowMs  = FRONTEND_RATE_LIMIT_WINDOW_MINUTES * 60_000  (default: 15 min)
  max       = FRONTEND_RATE_LIMIT_MAX                       (default: 100)
  store     = MemoryStore (in-process, default)
  keyGen    = req.ip (default)
  scope     = all /api/* routes

Command limiter (routes/commands.ts):
  windowMs  = 60_000 (1 min)
  max       = 10
  store     = MemoryStore (in-process, default)
  keyGen    = req.ip (default)
  scope     = POST /api/commands only
```

### Findings

**F1.1 - High: Command limiter is keyed by IP, not by authenticated user ID**

`requireAuth` runs before `commandLimiter` and attaches `req.user` to the request.
The limiter ignores this and uses `req.ip`. Consequences:

- Users behind a shared NAT share one counter. One user exhausting their limit blocks
  others at the same IP.
- A compromised JWT can be replayed from multiple IPs simultaneously. Each IP gets
  10 commands per minute independently. An attacker with 10 IPs and one stolen JWT
  can flood 100 hardware commands per minute, bypassing the per-route limit entirely.

The user ID is available in `req.user.id` at the point the limiter evaluates.
It is not being used.

**F1.2 - Medium: Both limiters use in-memory MemoryStore**

On every Railway restart or deploy, all counters reset to zero. If Railway runs
two instances concurrently, each has independent counters - a client effectively
gets `2 * max` requests per window. This is not exploitable on a single-instance
thesis deployment but the architecture does not guard against it.

**F1.3 - Informational: Global limit may be too low for a polling dashboard**

100 requests per 15 minutes = 6.7 per minute per IP. A dashboard polling
`/api/readings/latest` every 5 seconds exhausts this in about 8 minutes.

### Proposed fix

In `src/routes/commands.ts`, change `commandLimiter`:

```typescript
const commandLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Command rate limit exceeded. Maximum 30 commands per minute per user.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
});
```

`req.user` is populated by `router.use(requireAuth)` which runs before the route
handler. The fallback chain ensures a usable key even in edge cases.

### Resolution (2026-05-13)

Added `keyGenerator` to `commandLimiter` in `src/routes/commands.ts` keying by `req.user.id`,
with a fallback to `req.ip` (logged as a warning) if the user ID is somehow absent.
Limit value kept at 10/min (existing config). Added inline comment explaining NAT rationale.

---

## POINT 2 - Zod Validation on ALL Inputs

### What was checked

All 9 route files, all 9 controller files, all 5 validator files,
`src/middleware/validate.ts`.

### Validation coverage table

| Route | Method | Body | Query | Path param | Status |
|---|---|---|---|---|---|
| `/health` | GET | n/a | n/a | n/a | OK |
| `/health/deep` | GET | n/a | n/a | n/a | OK |
| `/health/ready` | GET | n/a | n/a | n/a | OK |
| `/api/readings/latest` | GET | n/a | none needed | n/a | OK |
| `/api/readings/history` | GET | n/a | `readingHistoryQuerySchema` | n/a | OK |
| `/api/readings/stats` | GET | n/a | `readingStatsQuerySchema` | n/a | OK |
| `/api/commands` | POST | `createCommandSchema` (discriminated union) | n/a | n/a | OK |
| `/api/commands` | GET | n/a | `commandQuerySchema` | n/a | PARTIAL |
| `/api/commands/recent` | GET | n/a | `commandQuerySchema` | n/a | PARTIAL |
| `/api/vision/latest` | GET | n/a | none needed | n/a | OK |
| `/api/vision/history` | GET | n/a | `visionHistoryQuerySchema` | n/a | OK |
| `/api/events` | GET | n/a | `eventsQuerySchema` | n/a | PARTIAL |
| `/api/events/recent` | GET | n/a | `eventsQuerySchema` | n/a | PARTIAL |
| `/api/devices` | GET | n/a | n/a | n/a | OK |
| `/api/devices/:device_name/last-seen` | GET | n/a | n/a | runtime check vs `DEVICE_NAMES` | OK |
| `/api/sun/today` | GET | n/a | none needed | n/a | OK |
| `/api/sun/week` | GET | n/a | none needed | n/a | OK |
| `/api/energy/summary` | GET | n/a | `energyQuerySchema` | n/a | OK |
| `/api/energy/dirt-impact` | GET | n/a | `dirtImpactQuerySchema` | n/a | OK |
| `/api/dashboard/summary` | GET | n/a | none needed | n/a | OK |

### Findings

**F2.1 - Low: `status` filter in command queries is an unvalidated free string**

`commandQuerySchema` (`src/validators/commands.schema.ts` line 38):
```typescript
status: z.string().optional(),
```

In `commandService.ts` it is split on commas and passed to `.in('status', statuses)`.
Any string reaches Supabase. An invalid value returns zero rows - no crash, no injection.
But it is semantically incorrect to accept values outside `COMMAND_STATUSES`.

**F2.2 - Low: `severity` filter in events queries is an unvalidated free string**

Same pattern. `eventsQuerySchema` line 6: `severity: z.string().optional()`.

### Proposed fix

Add a `.refine()` to both schemas, validating each comma-separated element against
the existing constants:

`src/validators/commands.schema.ts`:
```typescript
import { COMMAND_STATUSES } from '../utils/constants';

status: z.string()
  .refine(
    (v) => v.split(',').map(s => s.trim()).every(s =>
      (COMMAND_STATUSES as readonly string[]).includes(s)
    ),
    { message: `Each status must be one of: ${COMMAND_STATUSES.join(', ')}` }
  )
  .optional(),
```

`src/validators/events.schema.ts`:
```typescript
severity: z.string()
  .refine(
    (v) => v.split(',').map(s => s.trim()).every(s =>
      (SEVERITIES as readonly string[]).includes(s)
    ),
    { message: `Each severity must be one of: ${SEVERITIES.join(', ')}` }
  )
  .optional(),
```

No new dependencies. Both constants are already imported in the relevant files.

### Resolution (2026-05-13)

F2.1: Added `.refine()` with comma-split validation against `COMMAND_STATUSES` in `src/validators/commands.schema.ts`. Invalid values now produce 400.

F2.2: Added `.refine()` with comma-split validation against `SEVERITIES` in `src/validators/events.schema.ts`. Invalid values now produce 400.

---

## POINT 3 - CORS Configuration

### What was checked

`src/app.ts` lines 22-28, `src/config/env.ts` lines 13 and 39.

### Current configuration

```typescript
app.use(cors({
  origin: corsOrigins,          // string[] split from CORS_ORIGIN env var
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

`corsOrigins` is constructed in `env.ts` as an exact string array from `CORS_ORIGIN`.
Example value: `['http://localhost:3000', 'https://lighttrack.vercel.app']`.

### Findings

**F3.1 - Low: `credentials: true` is not needed for Bearer-token auth**

`credentials: true` causes the server to send `Access-Control-Allow-Credentials: true`.
This is only required when the browser makes requests with `credentials: 'include'`
(cookie-based auth). The auth model uses `Authorization: Bearer <JWT>` headers only,
not cookies. The `Authorization` header is explicitly listed in `allowedHeaders` and
cross-origin preflight already permits it - `credentials: true` adds nothing.

With a specific origin allow-list (not a wildcard), this is not exploitable. But it
is an incorrect posture: the server advertises "send your cookies" when it has no
session cookies and never reads them.

**F3.2 - No issue: Origin is a specific allow-list**

`origin: corsOrigins` checks `req.headers.origin` against an explicit string array.
No wildcard, no `true`, no function returning true unconditionally.

**F3.3 - No issue: Method and header restriction**

`methods: ['GET', 'POST']` and `allowedHeaders: ['Content-Type', 'Authorization']`
are explicit and minimal.

**F3.4 - No issue: Middleware ordering**

`helmet()` applies before `cors()`. Helmet adds security headers to all responses
including OPTIONS preflight. This does not interfere with CORS handling.

**F3.5 - Informational: Vercel preview deployments are not allowed**

Preview URLs like `lighttrack-git-feature.vercel.app` are blocked. Correct behaviour -
preview deployments should use a separate Railway dev environment if needed.

### Proposed fix

Change `credentials: true` to `credentials: false` in `src/app.ts`.
The `Authorization` header continues to work cross-origin via `allowedHeaders`.

### Resolution (2026-05-13)

Changed `credentials: true` to `credentials: false` in `src/app.ts`. Added inline comment
explaining that Bearer-token auth via Authorization header does not require cross-origin credentials.

---

## POINT 4 - Helmet Middleware

### What was checked

`src/app.ts` line 22. Actual headers confirmed by running the default helmet
config against a live test request in Node.js 22.

### Actual headers sent (confirmed)

| Header | Current value |
|---|---|
| `content-security-policy` | `default-src 'self';base-uri 'self';...` (full browser policy) |
| `cross-origin-opener-policy` | `same-origin` |
| `cross-origin-resource-policy` | `same-origin` |
| `referrer-policy` | `no-referrer` |
| `strict-transport-security` | `max-age=15552000; includeSubDomains` |
| `x-content-type-options` | `nosniff` |
| `x-dns-prefetch-control` | `off` |
| `x-frame-options` | `SAMEORIGIN` |
| `x-permitted-cross-domain-policies` | `none` |
| `x-xss-protection` | `0` |

### Findings

**F4.1 - Low: `x-frame-options: SAMEORIGIN` instead of `DENY`**

`SAMEORIGIN` permits the API to be embedded in an iframe from the same origin.
This API has no same-origin HTML pages. `DENY` is the correct value for a JSON
REST API - no framing is ever appropriate.

**F4.2 - Low: `cross-origin-resource-policy: same-origin` on a cross-origin API**

CORP controls no-cors cross-origin loading (image tags, script tags). For
cross-origin `fetch()` with CORS mode (what the Vercel frontend uses), the browser
uses CORS headers, not CORP. So `same-origin` does not break the frontend.
However, the header is semantically misleading. The correct value for a public
cross-origin API is `cross-origin`.

**F4.3 - Informational: CSP default is browser-targeted, irrelevant for a JSON API**

The full CSP policy has no effect on `application/json` responses. It would only
matter if this API ever returned HTML. Disabling it is cleaner.

**F4.4 - No issue: All remaining headers are correct**

`nosniff`, `referrer-policy: no-referrer`, HSTS, `x-xss-protection: 0` are all
appropriate for this deployment.

### Proposed fix

Replace `app.use(helmet())` with explicit options in `src/app.ts`:

```typescript
app.use(helmet({
  frameguard: { action: 'deny' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
```

No new dependencies. All other helmet defaults remain unchanged.

### Resolution (2026-05-13)

F4.1: Set `frameguard: { action: 'deny' }` - `x-frame-options` is now `DENY`.

F4.2: Set `crossOriginResourcePolicy: { policy: 'cross-origin' }` - header now correctly reflects
that the Vercel frontend fetches this API cross-origin. Added inline comment explaining the choice.
Note: `contentSecurityPolicy` was NOT disabled - the default CSP is harmless on JSON responses and
was not included in the approved fix scope.

---

## POINT 5 - JWT Verification

### What was checked

`src/middleware/auth.ts` (all lines), exported error classes from
`@supabase/supabase-js` (confirmed with Node.js inspection in the repo).

### Current implementation

```typescript
const { data, error } = await supabase.auth.getUser(token);
if (error || !data.user) {
  res.status(401).json({ error: 'Invalid or expired token' });
  return;
}
```

### Analysis

`supabase.auth.getUser(token)` makes an HTTPS request to
`SUPABASE_URL/auth/v1/user`. Supabase Auth processes the request server-side:

- JWT signature verification (asymmetric RS256, project-specific key)
- Expiration check (`exp` claim)
- Issuer check (must match this Supabase project)
- Active session check (revoked sessions fail even if `exp` has not passed)

**F5.1 - No issue: Verification is correct, complete, and server-side**

This is NOT a decode-only approach. A revoked token fails `auth.getUser()` even
if structurally valid and not yet expired. No manual JWKS handling is needed.

**F5.2 - No issue: Generic error messages on auth failure**

"Invalid or expired token" and "Token validation failed" leak no internals.

**F5.3 - Informational: Each request makes a network round-trip to Supabase Auth**

Under normal conditions this adds 20-80ms latency per authenticated request.
Acceptable trade-off for a thesis project.

**F5.4 - Medium: `AuthRetryableFetchError` (socket closed) returns 401 instead of 503, and is not logged**

When Supabase Auth is transiently unreachable (socket dropped, brief network
interruption), the client returns:
```
{ data: { user: null }, error: AuthRetryableFetchError }
  error.name   = 'AuthRetryableFetchError'
  error.status = 0  (no HTTP status, pure network failure)
  error.message = 'The socket connection was closed unexpectedly...'
```

Both an invalid token and a network error land in the same `if (error || !data.user)`
branch. The response is **401 "Invalid or expired token"**. This is the wrong status
code (503 is correct for a service unavailability) and the wrong message.

Depending on how the frontend handles 401s, this can trigger an unnecessary logout
during a transient Supabase network glitch. The error is also never logged, so there
is no server-side trace.

`@supabase/supabase-js` exports `isAuthRetryableFetchError` as a type-safe predicate.
No new dependency is needed.

### Proposed fix

In `src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      if (isAuthRetryableFetchError(error)) {
        logger.error('auth', 'Supabase Auth unreachable during token validation', error);
        res.status(503).json({ error: 'Authentication service temporarily unavailable' });
        return;
      }
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = data.user;
    next();
  } catch {
    res.status(401).json({ error: 'Token validation failed' });
  }
}
```

### Resolution (2026-05-13)

Imported `isAuthRetryableFetchError` from `@supabase/supabase-js` (no new dependency).
Network failures now return 503 with `Retry-After: 5` header, log the error via `logger.error`,
and include `requestId` in the response body. Invalid-token 401 path is unchanged.

---

## POINT 6 - Error Handling Without Leaking Internals

### What was checked

`src/middleware/errorHandler.ts`, `src/utils/httpError.ts`, `src/server.ts`,
`src/app.ts` (404 handler), all controllers for `HttpError` usage.

### Current error handler structure

```
HttpError      -> res.statusCode + err.message + err.details (if present)
ZodError       -> 400 + err.flatten()
SyntaxError    -> 400 + 'Invalid JSON in request body'
everything else -> logged + 500 + 'Internal server error'
```

### Findings

**F6.1 - High: No `process.on('unhandledRejection')` handler**

`src/server.ts` has no unhandled rejection or uncaught exception handlers.
In Node.js 15+ (this project uses Node.js 22), an unhandled promise rejection
calls `process.exit(1)` by default. The Railway container restarts, but during
the restart window all in-flight requests fail and any in-memory state is lost.

The current code structure is defensive (asyncHandler wraps all route handlers,
jobs use try/catch), but there is no last-resort handler for any path that is
accidentally missed.

**F6.2 - Medium: No correlation ID in 500 responses**

When an unhandled error produces a 500, `logger.error('errorHandler', ...)` logs
it server-side. But the response body is `{ error: 'Internal server error' }` with
no identifier. A user cannot provide any information to correlate their report to
a log entry. `req.requestId` is already set by requestLogger but is not used in
the 500 response.

**F6.3 - No issue: Stack traces are never included in 500 responses**

The 500 branch returns `{ error: 'Internal server error' }` only.

**F6.4 - No issue: HttpError messages in current code do not leak schema internals**

All `new HttpError(...)` call sites use intentional, developer-authored messages.
No Supabase or PostgreSQL error messages are forwarded.

**F6.5 - Low: `HttpError.details` is sent to the client in all environments**

`errorHandler.ts` lines 10-11 send `details` if not undefined. In the current
codebase no `HttpError` is constructed with a `details` argument, so there is no
active leak. But the mechanism exists - a future developer who passes a Supabase
error as `details` would expose it verbatim in the response.

**F6.6 - No issue: 404 handler is generic**

`{ error: 'Not found' }` - does not echo back the requested path.

### Proposed fixes

**F6.1** - Add to `src/server.ts` after the import block:
```typescript
process.on('unhandledRejection', (reason) => {
  logger.error('process', 'Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('process', 'Uncaught exception - shutting down', err);
  process.exit(1);
});
```

**F6.2** - In `src/middleware/errorHandler.ts`, include `requestId` in 500 responses.
Change the function signature from `_req` to `req` and use `req.requestId`:
```typescript
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // ... HttpError / ZodError / SyntaxError branches unchanged ...

  logger.error('errorHandler', 'Unhandled error', err);

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId,
  });
}
```

**F6.5** - In `src/middleware/errorHandler.ts`, restrict `details` to non-production:
```typescript
if (err instanceof HttpError) {
  res.status(err.statusCode).json({
    error: err.message,
    ...(err.details !== undefined && env.NODE_ENV !== 'production'
      ? { details: err.details }
      : {}),
  });
  return;
}
```

### Resolution (2026-05-13)

F6.1: Added `process.on('unhandledRejection')` (logs reason, continues running) and
`process.on('uncaughtException')` (logs error, exits with code 1 after 100ms flush delay)
in `src/server.ts` after the import block.

F6.2: Changed `_req` to `req` in `errorHandler` signature; 500 responses now include
`requestId: req.requestId` so client error reports can be correlated to server logs.

F6.5: `HttpError.details` is now logged server-side via `logger.error` and excluded from
the response body when `NODE_ENV === 'production'`. Development responses still include details.

---

## POINT 7 - Sensitive Data Not Being Logged

### What was checked

`src/middleware/requestLogger.ts`, `src/utils/logger.ts`, all service files
for `logger.error` call arguments.

### Fields logged per request (requestLogger.ts)

```
timestamp, requestId, method, path (req.originalUrl),
status, duration_ms, ip, userId (req.user?.id)
```

### Findings

**F7.1 - No issue: Authorization header is never logged**

requestLogger logs only the listed fields. `req.headers` is not captured.

**F7.2 - No issue: Request body is never logged**

`req.body` is not captured anywhere in requestLogger.

**F7.3 - No issue: Service role key never appears in any log call**

Confirmed by grep: the key is only in `src/config/env.ts` (validation) and
`src/config/supabase.ts` (client init). Neither file logs the key value.

**F7.4 - Low: `serializeErr` uses `JSON.stringify` without circular-reference protection**

In `src/utils/logger.ts` lines 22-23:
```typescript
if ('message' in obj) return { err: JSON.stringify(err) };
```

If `err` contains a circular reference, `JSON.stringify` throws
`TypeError: Converting circular structure to JSON`. This exception propagates
out of the logger into the error handler - the caller that was trying to log
an error would itself throw. In the global error handler this would prevent
a response from being sent at all.

Supabase error objects are flat in practice, so the risk is low. But it is
a latent failure mode for unexpected error types.

**F7.5 - Low: `req.originalUrl` logs the full path including query string**

`/api/readings/history?start_date=2026-05-01` is logged in full. This API
does not put tokens in query params, so nothing sensitive is currently logged.
If a future route used a query param for a one-time token or reset code, it
would be logged. Standard mitigation is to use `req.path` or redact known
sensitive param names.

**F7.6 - Informational: No redaction utility exists**

No shared list of header or field names that should be masked. Not needed for
the current field set. Defer until the project expands to log request headers
or bodies.

**F7.7 - Informational: Error stack traces are not logged**

`serializeErr` captures only `err.message` for Error instances. Stack traces
are never written to logs. Secure, but trades debuggability. Consider logging
the stack at `debug` level only in non-production.

### Proposed fix

**F7.4** - Add a try/catch around `JSON.stringify` in `src/utils/logger.ts`:
```typescript
if ('message' in obj) {
  try {
    return { err: JSON.stringify(err) };
  } catch {
    return { err: '[unserializable object]' };
  }
}
```

### Resolution (2026-05-13)

Wrapped `JSON.stringify(err)` in try/catch in `serializeErr`. On circular-reference or other
serialization failure, falls back to `{ err: String(obj.message), errName: String(obj.name) }`,
preserving the most useful fields without risking a logger-induced crash.

---

## POINT 8 - Service Role Key Location and Git History

### What was checked

- `grep -rn "service_role|SUPABASE_SERVICE_ROLE"` in current working tree
- `git log -p --all -S "service_role"` - full commit history
- `git log -p --all -S "SUPABASE_SERVICE_ROLE_KEY"` - env var name in history
- Full commit diff history searched for `eyJ[A-Za-z0-9_-]{20}` (JWT prefix)
- Full commit diff history searched for `sb_secret` and `sb_live` (newer Supabase key formats)
- `git ls-files .env .env.local .env.example .env.production .env.development`
- `.gitignore` contents

### Results

**Grep in current working tree:**
```
.env:4              SUPABASE_SERVICE_ROLE_KEY=sb_secret_... (local only, gitignored)
.env.example:4      SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here (placeholder)
src/config/env.ts   SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, ...) (validation only)
src/config/supabase SUPABASE_SERVICE_ROLE_KEY (client init only)
```

**`git ls-files`:** returned empty - no `.env*` files are tracked.

**Git history diff search:** `service_role` appears only in `README.md` content
(documentation prose). No commit diff line contains an actual key value.
No `eyJ...` base64 strings. No `sb_secret_...` or `sb_live_...` in any commit.

### Findings

**F8.1 - No issue: Service role key has never been committed to git**

Zero `.env*` files are tracked. The key exists only in the local `.env` file
which is correctly excluded by `.gitignore`. The full git history contains no
actual key value in any commit diff.

**F8.2 - No issue: Key usage is minimal**

The key is read in `src/config/env.ts` (Zod validation) and used in
`src/config/supabase.ts` (singleton client init). All other files import the
`supabase` singleton. The key value never flows beyond these two files.

**F8.3 - Informational: `.env.example` is in `.gitignore` (not committed to repo)**

`.gitignore` explicitly lists `.env.example`. New developers must refer to
`README.md` or `docs/API.md` (both committed) for environment variable
documentation. The committed README does document all required variables.
Not a security issue.

---

## Manual Steps Required

None required at this time. Point 8 confirmed no key rotation is needed.

---

## Future Hardening (Deferred)

**Distributed rate limiting with Redis**
The current in-memory MemoryStore is correct for a single Railway instance.
If the project ever scales to multiple instances, replace MemoryStore with
`rate-limit-redis` pointing to a shared Redis instance. This requires adding
a Redis service to the Railway project.

**IP allowlisting for Supabase access**
Supabase Pro plan allows restricting which IP addresses can connect. If the
Railway instance gets a static IP (Railway can provide this), allowlisting it
would prevent the service role key from being usable even if stolen.

**Auth token caching with short TTL**
`supabase.auth.getUser(token)` makes a network call per request. A short-lived
in-memory cache (30-60 seconds, keyed by token hash) would reduce Supabase Auth
load and improve resilience to brief Supabase Auth outages. Requires careful
invalidation logic.

**Request body logging with redaction**
If future routes need request body logging for debugging, add a shared redaction
list of field names (`password`, `token`, `secret`, `key`, `authorization`) to
mask before writing to logs.

**`req.path` instead of `req.originalUrl` in requestLogger**
Switching from `originalUrl` (includes query string) to `path` (path only)
removes any future risk of sensitive query parameters appearing in access logs.
The query string is currently harmless but the habit is better.
