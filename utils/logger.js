// utils/logger.js
const levels = ['error','warn','info','http','debug'];
const ts = () => new Date().toISOString();
const idx = (l) => levels.indexOf(l);

class LoggerClass {
  constructor(context = 'app', level = process.env.LOG_LEVEL || 'info') {
    this.context = context;
    this.level = levels.includes(level) ? level : 'info';
    this.stream = { write: (msg) => this.http(String(msg).trim()) };
  }
  setLevel(level) { if (levels.includes(level)) this.level = level; }
  shouldLog(level) { return idx(level) <= idx(this.level); }
  line(level, args) {
    const parts = args.map(a => typeof a === 'string' ? a : JSON.stringify(a));
    return `[${ts()}] ${level.toUpperCase()} [${this.context}] ${parts.join(' ')}`;
  }
  log(level, ...args) {
    if (!this.shouldLog(level)) return;
    const s = this.line(level, args);
    if (level === 'error') console.error(s);
    else if (level === 'warn') console.warn(s);
    else console.log(s);
  }
  error(...a){ this.log('error', ...a); }
  warn(...a){ this.log('warn', ...a); }
  info(...a){ this.log('info', ...a); }
  http(...a){ this.log('http', ...a); }
  debug(...a){ this.log('debug', ...a); }
}

// Экспорт как "конструктор" и как "статический" логгер одновременно
function Logger(context, level) { return new LoggerClass(context, level); } // позволяет new Logger(...)
const defaultLogger = new LoggerClass('app', process.env.LOG_LEVEL || 'info');

Logger.Logger = LoggerClass;
Logger.createLogger = (ctx, level) => new LoggerClass(ctx, level);
Logger.stream = defaultLogger.stream;
Logger.error = (...a) => defaultLogger.error(...a);
Logger.warn  = (...a) => defaultLogger.warn(...a);
Logger.info  = (...a) => defaultLogger.info(...a);
Logger.http  = (...a) => defaultLogger.http(...a);
Logger.debug = (...a) => defaultLogger.debug(...a);

module.exports = Logger;
