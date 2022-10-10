require('dotenv').config();
import { createLogger, Logger } from '@subsquid/logger';

export function renderLogs(msg: string, child: string) {
  if (process.env.STOR_WITH_CACHE_DEBUG !== 'true') return;

  let logger: Logger = createLogger('sqd:processor');
  logger.child(child).info(msg);
}
