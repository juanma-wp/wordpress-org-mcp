import * as fs from 'fs/promises';
import * as path from 'path';

beforeAll(async () => {
  // Create test directories
  const testDirs = [
    './test-cache',
    './test-extracted',
    './test-fixtures'
  ];

  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
});

afterAll(async () => {
  // Clean up test directories
  const testDirs = [
    './test-cache',
    './test-extracted',
    './test-fixtures'
  ];

  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  }
});