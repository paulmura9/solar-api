export type CacheDirective = {
  maxAge: number;
  staleWhileRevalidate: number;
  isPrivate: boolean;
};

const READINGS_LATEST_MAX_AGE_SECONDS = 2;
const READINGS_LATEST_SWR_SECONDS = 10;

const READINGS_HISTORY_MAX_AGE_SECONDS = 30;
const READINGS_HISTORY_SWR_SECONDS = 120;

const EVENTS_MAX_AGE_SECONDS = 10;
const EVENTS_SWR_SECONDS = 60;

const DEVICES_MAX_AGE_SECONDS = 5;
const DEVICES_SWR_SECONDS = 30;

const VISION_LATEST_MAX_AGE_SECONDS = 15;
const VISION_LATEST_SWR_SECONDS = 60;

const VISION_HISTORY_MAX_AGE_SECONDS = 60;
const VISION_HISTORY_SWR_SECONDS = 300;

const COMMANDS_MAX_AGE_SECONDS = 5;
const COMMANDS_SWR_SECONDS = 30;

const CAMERA_LATEST_MAX_AGE_SECONDS = 5;
const CAMERA_LATEST_SWR_SECONDS = 30;

const IS_PRIVATE = true;

export const cachePolicy = {
  readingsLatest: {
    maxAge: READINGS_LATEST_MAX_AGE_SECONDS,
    staleWhileRevalidate: READINGS_LATEST_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  readingsHistory: {
    maxAge: READINGS_HISTORY_MAX_AGE_SECONDS,
    staleWhileRevalidate: READINGS_HISTORY_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  events: {
    maxAge: EVENTS_MAX_AGE_SECONDS,
    staleWhileRevalidate: EVENTS_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  devices: {
    maxAge: DEVICES_MAX_AGE_SECONDS,
    staleWhileRevalidate: DEVICES_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  visionLatest: {
    maxAge: VISION_LATEST_MAX_AGE_SECONDS,
    staleWhileRevalidate: VISION_LATEST_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  visionHistory: {
    maxAge: VISION_HISTORY_MAX_AGE_SECONDS,
    staleWhileRevalidate: VISION_HISTORY_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  commands: {
    maxAge: COMMANDS_MAX_AGE_SECONDS,
    staleWhileRevalidate: COMMANDS_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
  cameraLatest: {
    maxAge: CAMERA_LATEST_MAX_AGE_SECONDS,
    staleWhileRevalidate: CAMERA_LATEST_SWR_SECONDS,
    isPrivate: IS_PRIVATE,
  },
} as const satisfies Record<string, CacheDirective>;
