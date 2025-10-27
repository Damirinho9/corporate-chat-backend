// utils/logger.js
const levels = ['error','warn','info','http','debug'];
const level = process.env.LOG_LEVEL && levels.includes(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'info';

const shouldLog = (lvl) => levels.indexOf(lvl) <= levels.indexOf(level);
const ts = () => new Date().toISOString();

const log = (lvl, ...args) => {
  if (!shouldLog(lvl)) return;
  const line = `[${ts()}] ${lvl.toUpperCase()}: ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  if (lvl === 'error') console.error(line);
  else if (lvl === 'warn') console.warn(line);
  else console.log(line);
};

const logger = {
  error: (...a) => log('error', ...a),
  warn:  (...a) => log('warn', ...a),
  info:  (...a) => log('info', ...a),
  http:  (...a) => log('http', ...a),
  debug: (...a) => log('debug', ...a),
  // совместимо с morgan
  stream: { write: (msg) => logger.http(msg.trim()) }
};

module.exports = logger;