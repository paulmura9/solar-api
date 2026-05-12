import './config/env';
import app from './app';
import { env } from './config/env';
import { startCommandTimeoutJob } from './jobs/commandTimeoutJob';
import { startDeviceOfflineJob } from './jobs/deviceOfflineJob';
import { startSunScheduleJob } from './jobs/sunScheduleJob';
import { logger } from './utils/logger';

startCommandTimeoutJob();
startDeviceOfflineJob();
startSunScheduleJob();

app.listen(env.PORT, () => {
  logger.info('server', `LightTrack API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});
