import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { InsertedVisionResult, PreviousVisionResult } from './visionService';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ALERT_SUBJECT = 'LightTrack: panel needs cleaning';
const DIRTY_PREDICTED_CLASS = 'dirty';

const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Formats an ISO timestamp as a short, readable UTC string,
 * e.g. "01 Jun 2026, 02:05 UTC". Falls back to the raw value if the input
 * cannot be parsed, so the email is never broken by a bad timestamp.
 */
function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

/**
 * Resolves the email addresses of the users who own the given device, via the
 * user_devices link table and the Supabase admin API (service_role). Returns a
 * de-duplicated list of valid, non-null emails. Best-effort: on any error it
 * logs and returns whatever was collected so the caller can fall back. Never
 * throws.
 */
export async function getUsersForDevice(deviceId: string): Promise<string[]> {
  const emails = new Set<string>();

  const { data, error } = await supabase
    .from('user_devices')
    .select('user_id')
    .eq('device_id', deviceId);

  if (error) {
    logger.error('emailService', `Failed to list users for device ${deviceId}`, error);
    return [...emails];
  }
  if (!data) return [...emails];

  for (const row of data) {
    const userId = (row as Record<string, unknown>)['user_id'];
    if (typeof userId !== 'string' || userId.length === 0) continue;

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) {
      logger.error('emailService', `Failed to resolve email for user ${userId}`, userError);
      continue;
    }

    const email = userData.user?.email;
    if (typeof email === 'string' && email.length > 0) {
      emails.add(email);
    }
  }

  return [...emails];
}

interface ResolvedRecipients {
  recipients: string[];
  usedFallback: boolean;
}

/**
 * Resolves the alert recipients: the users who own the given device, or
 * ALERT_EMAIL_TO as a fallback when the device has no linked users (or the
 * lookup failed, since getUsersForDevice returns [] on error). The fallback
 * keeps the admin alerted during setup before any user_devices rows exist.
 * `usedFallback` is reported so the caller can log it. `recipients` is empty
 * only when no recipient can be determined at all.
 */
export async function resolveRecipients(deviceId: string): Promise<ResolvedRecipients> {
  const userEmails = await getUsersForDevice(deviceId);
  if (userEmails.length > 0) return { recipients: userEmails, usedFallback: false };

  const fallback = env.ALERT_EMAIL_TO;
  if (fallback) {
    logger.warn(
      'emailService',
      `No users linked to device ${deviceId} (none owned or lookup failed); falling back to ALERT_EMAIL_TO`
    );
    return { recipients: [fallback], usedFallback: true };
  }

  return { recipients: [], usedFallback: false };
}

/** A vision result "needs cleaning" when flagged or classified as dirty. */
export function isNeedsCleaning(result: PreviousVisionResult): boolean {
  return result.cleaningRequired === true || result.predictedClass === DIRTY_PREDICTED_CLASS;
}

/**
 * True only on the edge into "needs cleaning": the current result needs
 * cleaning while the previous one did not (or there was no previous). A
 * low-quality result (obstruction) is never a real measurement, so it never
 * triggers an alert. Pure and deterministic for easy unit testing.
 */
export function isCleaningTransition(
  current: InsertedVisionResult,
  previous: PreviousVisionResult | null
): boolean {
  if (current.qualityOk === false) return false;
  if (!isNeedsCleaning(current)) return false;
  return previous === null || !isNeedsCleaning(previous);
}

function buildAlertHtml(result: InsertedVisionResult, deviceId: string): string {
  return [
    '<h2>LightTrack — panel needs cleaning</h2>',
    '<p>The vision pipeline detected that the solar panel needs cleaning.</p>',
    '<ul>',
    `<li><strong>Device:</strong> ${deviceId}</li>`,
    `<li><strong>Dirt level:</strong> ${result.dirtLevelPercent}%</li>`,
    `<li><strong>Class:</strong> ${result.predictedClass ?? 'n/a'}</li>`,
    `<li><strong>Captured at:</strong> ${formatCapturedAt(result.timestamp)}</li>`,
    '</ul>',
  ].join('');
}

/**
 * Sends a single cleaning-alert email to one recipient via Resend. Sends each
 * address in its own request so one bad address (e.g. an invalid test account)
 * cannot fail delivery to everyone else. Returns true on success, false on a
 * non-OK status or network error. Never throws.
 */
async function sendToRecipient(apiKey: string, recipient: string, html: string): Promise<boolean> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: [recipient],
        subject: ALERT_SUBJECT,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('emailService', `Cleaning alert failed for ${recipient}`, {
        status: response.status,
        body,
      });
      return false;
    }

    logger.info('emailService', `Cleaning alert sent to ${recipient}`);
    return true;
  } catch (err) {
    logger.error('emailService', `Cleaning alert errored for ${recipient}`, err);
    return false;
  }
}

/**
 * Sends the cleaning alert via Resend. Best-effort and fail-safe: if Resend is
 * not configured it logs a warning and returns. Each recipient is sent
 * independently, so a single invalid address never blocks the others, and any
 * network/API error is caught and logged per address. Never throws, so the
 * saved vision_result is never lost.
 */
export async function sendCleaningAlert(
  result: InsertedVisionResult,
  deviceId: string
): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('emailService', 'Cleaning alert skipped: RESEND_API_KEY not configured');
    return;
  }

  const { recipients, usedFallback } = await resolveRecipients(deviceId);
  if (recipients.length === 0) {
    logger.warn(
      'emailService',
      `Cleaning alert skipped for device ${deviceId}: no recipients (no linked users and ALERT_EMAIL_TO not set)`
    );
    return;
  }

  logger.info(
    'emailService',
    `Cleaning alert for device ${deviceId}: dispatching to ${recipients.length} recipient(s) (fallback=${usedFallback})`
  );

  const html = buildAlertHtml(result, deviceId);
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const ok = await sendToRecipient(apiKey, recipient, html);
    if (ok) sent += 1;
    else failed += 1;
  }

  logger.info(
    'emailService',
    `Cleaning alert dispatch complete: ${sent} sent, ${failed} failed of ${recipients.length}`
  );
}
