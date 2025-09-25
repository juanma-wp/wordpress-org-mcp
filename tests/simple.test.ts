import * as fs from 'fs/promises';
import * as path from 'path';

describe('Simple Tests', () => {
  it('should pass basic functionality tests', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect([1, 2, 3]).toHaveLength(3);
  });

  it('should work with async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should work with file system operations', async () => {
    const testPath = './test-temp';
    try {
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(path.join(testPath, 'test.txt'), 'test content');
      const content = await fs.readFile(path.join(testPath, 'test.txt'), 'utf-8');
      expect(content).toBe('test content');
    } finally {
      try {
        await fs.rm(testPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});