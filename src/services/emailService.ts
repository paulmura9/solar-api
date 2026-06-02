import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { InsertedVisionResult, PreviousVisionResult } from './visionService';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ALERT_SUBJECT = 'LightTrack: panel needs cleaning';
const DIRTY_PREDICTED_CLASS = 'dirty';

const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 100;

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
 * Fetches every registered user's email via the Supabase admin API
 * (service_role). Pages through results and returns a de-duplicated list of
 * valid, non-null emails. Best-effort: on error it logs and returns whatever
 * was collected so the caller can fall back. Never throws.
 */
export async function getAllUserEmails(): Promise<string[]> {
  const emails = new Set<string>();

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) {
      logger.error('emailService', 'Failed to list Supabase users', error);
      break;
    }

    const { users } = data;
    for (const user of users) {
      if (typeof user.email === 'string' && user.email.length > 0) {
        emails.add(user.email);
      }
    }

    if (users.length < USERS_PER_PAGE) break;
  }

  return [...emails];
}

interface ResolvedRecipients {
  recipients: string[];
  usedFallback: boolean;
}

/**
 * Resolves the alert recipients: all registered users, or ALERT_EMAIL_TO as a
 * fallback when there are no users or the listing failed (getAllUserEmails
 * returns [] on error). `usedFallback` is reported so the caller can log it.
 * `recipients` is empty only when no recipient can be determined at all.
 */
async function resolveRecipients(): Promise<ResolvedRecipients> {
  const userEmails = await getAllUserEmails();
  if (userEmails.length > 0) return { recipients: userEmails, usedFallback: false };

  const fallback = env.ALERT_EMAIL_TO;
  if (fallback) {
    logger.warn(
      'emailService',
      'No user emails available (none registered or listing failed); falling back to ALERT_EMAIL_TO'
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

function buildAlertHtml(result: InsertedVisionResult): string {
  return [
    '<h2>LightTrack — panel needs cleaning</h2>',
    '<p>The vision pipeline detected that the solar panel needs cleaning.</p>',
    '<ul>',
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
export async function sendCleaningAlert(result: InsertedVisionResult): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('emailService', 'Cleaning alert skipped: RESEND_API_KEY not configured');
    return;
  }

  const { recipients, usedFallback } = await resolveRecipients();
  if (recipients.length === 0) {
    logger.warn(
      'emailService',
      'Cleaning alert skipped: no recipients (no users and ALERT_EMAIL_TO not set)'
    );
    return;
  }

  logger.info(
    'emailService',
    `Cleaning alert: dispatching to ${recipients.length} recipient(s) (fallback=${usedFallback})`
  );

  const html = buildAlertHtml(result);
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
