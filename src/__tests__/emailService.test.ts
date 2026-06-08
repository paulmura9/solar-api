import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import {
  isNeedsCleaning,
  isCleaningTransition,
  getUsersForDevice,
  resolveRecipients,
} from '../services/emailService';
import type { InsertedVisionResult, PreviousVisionResult } from '../services/visionService';
import { supabase } from '../config/supabase';
import { env } from '../config/env';

interface UserDeviceRow {
  user_id: string;
}

/**
 * Mocks supabase.from('user_devices').select('user_id').eq('device_id', id) to
 * return the rows registered for that device id (or an empty list). When
 * `error` is true the query resolves with an error, exercising the fail-safe.
 */
function mockUserDevices(
  t: TestContext,
  rowsByDevice: Record<string, UserDeviceRow[]>,
  options: { error?: boolean } = {}
): void {
  t.mock.method(supabase, 'from', () => ({
    select: () => ({
      eq: (_column: string, value: string) =>
        options.error
          ? Promise.resolve({ data: null, error: { message: 'query failed' } })
          : Promise.resolve({ data: rowsByDevice[value] ?? [], error: null }),
    }),
  }));
}

/** Mocks supabase.auth.admin.getUserById to resolve each user id to an email. */
function mockGetUserById(t: TestContext, emailByUser: Record<string, string | null>): void {
  t.mock.method(supabase.auth.admin, 'getUserById', (id: string) => {
    const email = emailByUser[id] ?? null;
    return Promise.resolve({
      data: { user: email === null ? null : { id, email } },
      error: null,
    });
  });
}

function current(overrides: Partial<InsertedVisionResult>): InsertedVisionResult {
  return {
    id: 2,
    deviceId: 'esp32-solar-01',
    timestamp: '2026-06-01T10:00:00.000Z',
    dirtLevelPercent: 80,
    cleanlinessPercent: 20,
    cleaningRequired: false,
    confidence: 0.9,
    imagePath: null,
    processedImagePath: null,
    predictedClass: 'clean',
    qualityOk: true,
    qualityReason: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function previous(overrides: Partial<PreviousVisionResult>): PreviousVisionResult {
  return { cleaningRequired: false, predictedClass: 'clean', ...overrides };
}

test('isNeedsCleaning: true when cleaning_required', () => {
  assert.equal(isNeedsCleaning({ cleaningRequired: true, predictedClass: 'clean' }), true);
});

test('isNeedsCleaning: true when predicted_class is dirty', () => {
  assert.equal(isNeedsCleaning({ cleaningRequired: false, predictedClass: 'dirty' }), true);
});

test('isNeedsCleaning: false when clean and not flagged', () => {
  assert.equal(isNeedsCleaning({ cleaningRequired: false, predictedClass: 'slightly_dirty' }), false);
});

test('transition: clean -> dirty sends', () => {
  assert.equal(
    isCleaningTransition(current({ cleaningRequired: true }), previous({ cleaningRequired: false })),
    true
  );
});

test('transition: no previous result sends', () => {
  assert.equal(isCleaningTransition(current({ predictedClass: 'dirty' }), null), true);
});

test('transition: dirty -> dirty does not resend', () => {
  assert.equal(
    isCleaningTransition(current({ cleaningRequired: true }), previous({ cleaningRequired: true })),
    false
  );
});

test('transition: current not needing cleaning does not send', () => {
  assert.equal(isCleaningTransition(current({ cleaningRequired: false }), null), false);
});

test('transition: quality_ok false never sends (obstruction)', () => {
  assert.equal(
    isCleaningTransition(current({ cleaningRequired: true, qualityOk: false }), null),
    false
  );
});

test('getUsersForDevice: returns only emails linked to the given device', async (t) => {
  mockUserDevices(t, { 'device-a': [{ user_id: 'user-1' }, { user_id: 'user-2' }] });
  mockGetUserById(t, { 'user-1': 'one@example.com', 'user-2': 'two@example.com' });

  const emails = await getUsersForDevice('device-a');

  assert.deepEqual(emails.sort(), ['one@example.com', 'two@example.com']);
});

test('getUsersForDevice: de-duplicates and drops null/empty emails', async (t) => {
  mockUserDevices(t, {
    'device-a': [{ user_id: 'user-1' }, { user_id: 'user-1' }, { user_id: 'user-3' }],
  });
  mockGetUserById(t, { 'user-1': 'dup@example.com', 'user-3': null });

  const emails = await getUsersForDevice('device-a');

  assert.deepEqual(emails, ['dup@example.com']);
});

test('getUsersForDevice: returns [] (never throws) when the query errors', async (t) => {
  mockUserDevices(t, {}, { error: true });

  const emails = await getUsersForDevice('device-a');

  assert.deepEqual(emails, []);
});

test('getUsersForDevice: a device only resolves its own owners, not another device’s', async (t) => {
  mockUserDevices(t, {
    'device-a': [{ user_id: 'user-a' }],
    'device-b': [{ user_id: 'user-b' }],
  });
  mockGetUserById(t, { 'user-a': 'a@example.com', 'user-b': 'b@example.com' });

  const emails = await getUsersForDevice('device-a');

  assert.deepEqual(emails, ['a@example.com']);
  assert.equal(emails.includes('b@example.com'), false);
});

test('resolveRecipients: uses the device owners when present (no fallback)', async (t) => {
  mockUserDevices(t, { 'device-a': [{ user_id: 'user-1' }] });
  mockGetUserById(t, { 'user-1': 'one@example.com' });

  const resolved = await resolveRecipients('device-a');

  assert.deepEqual(resolved.recipients, ['one@example.com']);
  assert.equal(resolved.usedFallback, false);
});

test('resolveRecipients: falls back to ALERT_EMAIL_TO when the device has no linked users', async (t) => {
  mockUserDevices(t, { 'device-a': [] });

  const original = env.ALERT_EMAIL_TO;
  env.ALERT_EMAIL_TO = 'admin@example.com';
  t.after(() => {
    env.ALERT_EMAIL_TO = original;
  });

  const resolved = await resolveRecipients('device-a');

  assert.deepEqual(resolved.recipients, ['admin@example.com']);
  assert.equal(resolved.usedFallback, true);
});
