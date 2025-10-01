import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Test helper utilities for MCP integration tests.
 */

/**
 * Clean up test directories and files.
 */
export async function cleanupTestDirectories(): Promise<void> {
  const testDirs = [
    path.join(process.cwd(), 'test-cache'),
    path.join(process.cwd(), 'test-extracted'),
    path.join(process.cwd(), 'test-fixtures')
  ];

  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  }
}

/**
 * Create test directories if they don't exist.
 */
export async function setupTestDirectories(): Promise<void> {
  const testDirs = [
    path.join(process.cwd(), 'test-cache'),
    path.join(process.cwd(), 'test-extracted'),
    path.join(process.cwd(), 'test-fixtures')
  ];

  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}

/**
 * Wait for a specified amount of time.
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await wait(delay);
    }
  }

  throw lastError!;
}

/**
 * Create a mock plugin directory structure for testing.
 */
export async function createMockPlugin(pluginSlug: string, files: Record<string, string>): Promise<string> {
  const pluginPath = path.join(process.cwd(), 'test-fixtures', pluginSlug);
  await fs.mkdir(pluginPath, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(pluginPath, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  return pluginPath;
}

/**
 * Check if a test is running in CI environment.
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

/**
 * Get a timeout value that's appropriate for the environment.
 * Uses longer timeouts in CI to account for slower environments.
 */
export function getTimeout(baseTimeout: number): number {
  return isCI() ? baseTimeout * 2 : baseTimeout;
}