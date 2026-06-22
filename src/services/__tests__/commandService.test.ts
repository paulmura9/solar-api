import { describe, it, expect, vi, beforeEach } from 'vitest';

const supa = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const inStatus = vi.fn(() => ({ select }));
  const eqId = vi.fn(() => ({ in: inStatus }));
  const update = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ update }));
  return { maybeSingle, select, inStatus, eqId, update, from };
});

vi.mock('../../config/supabase', () => ({ supabase: { from: supa.from } }));

import { acknowledgeCommand } from '../commandService';
import { logger } from '../../utils/logger';

function commandRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cmd-1',
    device_id: 'esp32-solar-01',
    command_type: 'MOVE_PANEL',
    payload: { h_angle: 90, v_angle: 90 },
    status: 'ACKNOWLEDGED',
    error_message: null,
    created_at: '2026-06-01T10:00:00.000Z',
    sent_at: '2026-06-01T10:00:01.000Z',
    acknowledged_at: '2026-06-01T10:00:02.000Z',
    ...overrides,
  };
}

describe('acknowledgeCommand idempotency guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ack_on_pending_command_succeeds', async () => {
    supa.maybeSingle.mockResolvedValue({
      data: commandRow({ id: 'cmd-1', status: 'ACKNOWLEDGED' }),
      error: null,
    });

    const dto = await acknowledgeCommand('cmd-1', 'ACKNOWLEDGED', null, { foo: 'bar' });

    expect(dto).not.toBeNull();
    expect(dto?.status).toBe('ACKNOWLEDGED');
    expect(supa.inStatus).toHaveBeenCalledWith('status', ['PENDING', 'SENT']);
  });

  it('ack_on_sent_command_succeeds', async () => {
    supa.maybeSingle.mockResolvedValue({
      data: commandRow({ id: 'cmd-2', status: 'ACKNOWLEDGED' }),
      error: null,
    });

    const dto = await acknowledgeCommand('cmd-2', 'ACKNOWLEDGED', null, null);

    expect(dto).not.toBeNull();
    expect(dto?.id).toBe('cmd-2');
    expect(dto?.status).toBe('ACKNOWLEDGED');
    expect(supa.eqId).toHaveBeenCalledWith('id', 'cmd-2');
    expect(supa.inStatus).toHaveBeenCalledWith('status', ['PENDING', 'SENT']);
  });

  it('duplicate_ack_on_terminal_command_is_ignored', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    supa.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await acknowledgeCommand('cmd-1', 'ACKNOWLEDGED', null, { foo: 'bar' });

    expect(result).toBeNull();
    expect(supa.inStatus).toHaveBeenCalledWith('status', ['PENDING', 'SENT']);
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });
});
