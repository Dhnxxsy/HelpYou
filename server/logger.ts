export function info(...args: unknown[]) {
  console.log(`[${new Date().toLocaleTimeString()}] [INFO]`, ...args);
}

export function warn(...args: unknown[]) {
  console.warn(`[${new Date().toLocaleTimeString()}] [WARN]`, ...args);
}

export function error(...args: unknown[]) {
  console.error(`[${new Date().toLocaleTimeString()}] [ERROR]`, ...args);
}
