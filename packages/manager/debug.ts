/**
 * Debug logging utility
 * 
 * Enable debug mode by setting environment variable:
 *   export PI_MANAGER_DEBUG=1
 * 
 * Or in .env file:
 *   PI_MANAGER_DEBUG=1
 */

const DEBUG = process.env.PI_MANAGER_DEBUG === '1' || process.env.PI_MANAGER_DEBUG === 'true';

/**
 * Log debug message if debug mode is enabled
 */
export function debug(...args: any[]): void {
  if (DEBUG) {
    console.log('[manager:debug]', ...args);
  }
}

/**
 * Log info message (always shown)
 */
export function info(...args: any[]): void {
  console.log('[manager]', ...args);
}

/**
 * Log warning message (always shown)
 */
export function warn(...args: any[]): void {
  console.warn('[manager:warn]', ...args);
}

/**
 * Log error message (always shown)
 */
export function error(...args: any[]): void {
  console.error('[manager:error]', ...args);
}
