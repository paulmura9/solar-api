import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isNeedsCleaning, isCleaningTransition } from '../services/emailService';
import type { InsertedVisionResult, PreviousVisionResult } from '../services/visionService';

function current(overrides: Partial<InsertedVisionResult>): InsertedVisionResult {
  return {
    id: 2,
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
