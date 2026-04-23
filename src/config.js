import 'dotenv/config';
import path from 'path';

const ROOT_DIR = process.cwd();
const dataDir = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const crawlIntervalMs = Number(process.env.CRAWL_INTERVAL_MS || 3 * 60 * 60 * 1000);
const requestDelayMs = Number(process.env.REQUEST_DELAY_MS || 3000);

export const config = {
  port: Number(process.env.PORT || 3000),
  paths: {
    data: dataDir,
    favs: path.join(dataDir, 'favs'),
    novels: path.join(dataDir, 'novels'),
    logs: path.join(dataDir, 'logs'),
    users: path.join(dataDir, 'users'),
  },
  intervals: {
    crawl: crawlIntervalMs,
    requestDelay: requestDelayMs,
  }
};
