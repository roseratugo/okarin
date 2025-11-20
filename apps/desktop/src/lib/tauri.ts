import { invoke as tauriInvoke } from '@tauri-apps/api/core';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

export class InvokeTimeoutError extends Error {
  constructor(command: string, timeout: number) {
    super(`Tauri invoke '${command}' timed out after ${timeout}ms`);
    this.name = 'InvokeTimeoutError';
  }
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new InvokeTimeoutError(command, timeout));
    }, timeout);
  });

  return Promise.race([tauriInvoke<T>(command, args), timeoutPromise]);
}

// Re-export for convenience
export { tauriInvoke };
