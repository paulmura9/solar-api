import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { InsertedVisionResult, PreviousVisionResult } from './visionService';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ALERT_SUBJECT = 'LightTrack: panoul necesita curatare';
const DIRTY_PREDICTED_CLASS = 'dirty';

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
    '<h2>LightTrack — panoul necesita curatare</h2>',
    '<p>Pipeline-ul de viziune a detectat ca panoul solar necesita curatare.</p>',
    '<ul>',
    `<li><strong>Nivel murdarie:</strong> ${result.dirtLevelPercent}%</li>`,
    `<li><strong>Clasa:</strong> ${result.predictedClass ?? 'n/a'}</li>`,
    `<li><strong>Ora capturii:</strong> ${result.timestamp}</li>`,
    '</ul>',
  ].join('');
}

/**
 * Sends the cleaning alert via Resend. Best-effort and fail-safe: if Resend is
 * not configured it logs a warning and returns; any network/API error is
 * caught and logged. Never throws, so the saved vision_result is never lost.
 */
export async function sendCleaningAlert(result: InsertedVisionResult): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ALERT_EMAIL_TO;

  if (!apiKey || !to) {
    logger.warn(
      'emailService',
      'Cleaning alert skipped: RESEND_API_KEY or ALERT_EMAIL_TO not configured'
    );
    return;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: [to],
        subject: ALERT_SUBJECT,
        html: buildAlertHtml(result),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('emailService', 'Resend API returned a non-OK status', {
        status: response.status,
        body,
      });
      return;
    }

    logger.info('emailService', 'Cleaning alert email sent');
  } catch (err) {
    logger.error('emailService', 'Failed to send cleaning alert email', err);
  }
}
