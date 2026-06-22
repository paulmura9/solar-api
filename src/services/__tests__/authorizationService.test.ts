import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const supa = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const limit = vi.fn(() => ({ maybeSingle }));
  const eqDevice = vi.fn(() => ({ limit }));
  const eqUser = vi.fn(() => ({ eq: eqDevice }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, limit, eqDevice, eqUser, select, from };
});

vi.mock('../../config/supabase', () => ({ supabase: { from: supa.from } }));
vi.mock('../../config/env', () => ({ env: { DEFAULT_DEVICE_ID: 'esp32-solar-01' } }));
vi.mock('../commandService', () => ({
  createAndDispatchCommand: vi.fn(),
  getRecentCommands: vi.fn(),
}));

import { isUserLinkedToDevice } from '../authorizationService';
import { postCommand } from '../../controllers/commands.controller';
import { createAndDispatchCommand } from '../commandService';
import { logger } from '../../utils/logger';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DEVICE_ID = 'esp32-solar-01';

function mockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
}

function commandReq(userId?: string): Request {
  return {
    body: { command_type: 'MOVE_PANEL', payload: { h_angle: 90, v_angle: 90 } },
    user: userId ? { id: userId } : undefined,
  } as unknown as Request;
}

describe('isUserLinkedToDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('linked_user_returns_true', async () => {
    supa.maybeSingle.mockResolvedValue({ data: { user_id: USER_ID }, error: null });

    const linked = await isUserLinkedToDevice(USER_ID, DEVICE_ID);

    expect(linked).toBe(true);
    expect(supa.from).toHaveBeenCalledWith('user_devices');
    expect(supa.eqUser).toHaveBeenCalledWith('user_id', USER_ID);
    expect(supa.eqDevice).toHaveBeenCalledWith('device_id', DEVICE_ID);
  });

  it('unlinked_user_returns_false', async () => {
    supa.maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await isUserLinkedToDevice(USER_ID, DEVICE_ID)).toBe(false);
  });

  it('query_error_denies_fail_closed', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    supa.maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    expect(await isUserLinkedToDevice(USER_ID, DEVICE_ID)).toBe(false);
    expect(errorSpy).toHaveBeenCalledOnce();

    errorSpy.mockRestore();
  });
});

describe('postCommand ownership gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('linked_user_command_proceeds_unchanged', async () => {
    supa.maybeSingle.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    vi.mocked(createAndDispatchCommand).mockResolvedValue({
      id: 'cmd-1',
      deviceId: DEVICE_ID,
      commandType: 'MOVE_PANEL',
      payload: { h_angle: 90, v_angle: 90 },
      status: 'PENDING',
      errorMessage: null,
      createdAt: '2026-06-11T10:00:00.000Z',
      sentAt: null,
      acknowledgedAt: null,
    });
    const { res, status, json } = mockRes();

    await postCommand(commandReq(USER_ID), res);

    expect(supa.eqDevice).toHaveBeenCalledWith('device_id', 'esp32-solar-01');
    expect(createAndDispatchCommand).toHaveBeenCalledWith(
      'MOVE_PANEL',
      { h_angle: 90, v_angle: 90 },
      undefined
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledOnce();
  });

  it('unlinked_user_gets_403_and_no_dispatch', async () => {
    supa.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { res, status, json } = mockRes();

    await postCommand(commandReq(USER_ID), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'You are not authorized to control this device' });
    expect(createAndDispatchCommand).not.toHaveBeenCalled();
  });

  it('helper_query_error_results_in_403_fail_closed', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    supa.maybeSingle.mockResolvedValue({ data: null, error: { message: 'db outage' } });
    const { res, status, json } = mockRes();

    await postCommand(commandReq(USER_ID), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'You are not authorized to control this device' });
    expect(createAndDispatchCommand).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
