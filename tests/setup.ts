import * as fs from 'fs/promises';
import * as path from 'path';

beforeAll(async () => {
  // Create test directories
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
});

afterAll(async () => {
  // Clean up test directories
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
});