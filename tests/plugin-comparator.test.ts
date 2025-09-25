import { PluginComparator } from '../src/plugin-comparator';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('PluginComparator', () => {
  let comparator: PluginComparator;
  const testFixturesDir = './test-fixtures';

  beforeEach(() => {
    comparator = new PluginComparator();
  });

  afterEach(async () => {
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('comparePlugins', () => {
    it('should compare identical plugins', async () => {
      // Setup test directories
      const localPath = path.join(testFixturesDir, 'local');
      const remotePath = path.join(testFixturesDir, 'remote');

      await fs.mkdir(localPath, { recursive: true });
      await fs.mkdir(remotePath, { recursive: true });

      // Create identical files
      const fileContent = 'identical content';
      await fs.writeFile(path.join(localPath, 'main.php'), fileContent);
      await fs.writeFile(path.join(remotePath, 'main.php'), fileContent);

      const comparison = await comparator.comparePlugins(localPath, remotePath);

      expect(comparison.summary.identical).toBe(1);
      expect(comparison.summary.different).toBe(0);
      expect(comparison.summary.localOnly).toBe(0);
      expect(comparison.summary.remoteOnly).toBe(0);
      expect(comparison.summary.total).toBe(1);
      expect(comparison.files[0].status).toBe('identical');
    });

    it('should detect different files', async () => {
      // Setup test directories
      const localPath = path.join(testFixturesDir, 'local');
      const remotePath = path.join(testFixturesDir, 'remote');

      await fs.mkdir(localPath, { recursive: true });
      await fs.mkdir(remotePath, { recursive: true });

      // Create different files
      await fs.writeFile(path.join(localPath, 'main.php'), 'local content');
      await fs.writeFile(path.join(remotePath, 'main.php'), 'remote content');

      const comparison = await comparator.comparePlugins(localPath, remotePath);

      expect(comparison.summary.identical).toBe(0);
      expect(comparison.summary.different).toBe(1);
      expect(comparison.summary.localOnly).toBe(0);
      expect(comparison.summary.remoteOnly).toBe(0);
      expect(comparison.summary.total).toBe(1);
      expect(comparison.files[0].status).toBe('different');
      expect(comparison.files[0].diff).toContain('-remote content');
      expect(comparison.files[0].diff).toContain('+local content');
    });

    it('should detect local-only files', async () => {
      // Setup test directories
      const localPath = path.join(testFixturesDir, 'local');
      const remotePath = path.join(testFixturesDir, 'remote');

      await fs.mkdir(localPath, { recursive: true });
      await fs.mkdir(remotePath, { recursive: true });

      // Create local-only file
      await fs.writeFile(path.join(localPath, 'local-only.php'), 'local only content');

      const comparison = await comparator.comparePlugins(localPath, remotePath);

      expect(comparison.summary.identical).toBe(0);
      expect(comparison.summary.different).toBe(0);
      expect(comparison.summary.localOnly).toBe(1);
      expect(comparison.summary.remoteOnly).toBe(0);
      expect(comparison.summary.total).toBe(1);
      expect(comparison.files[0].status).toBe('local_only');
      expect(comparison.files[0].localSize).toBeGreaterThan(0);
    });

    it('should detect remote-only files', async () => {
      // Setup test directories
      const localPath = path.join(testFixturesDir, 'local');
      const remotePath = path.join(testFixturesDir, 'remote');

      await fs.mkdir(localPath, { recursive: true });
      await fs.mkdir(remotePath, { recursive: true });

      // Create remote-only file
      await fs.writeFile(path.join(remotePath, 'remote-only.php'), 'remote only content');

      const comparison = await comparator.comparePlugins(localPath, remotePath);

      expect(comparison.summary.identical).toBe(0);
      expect(comparison.summary.different).toBe(0);
      expect(comparison.summary.localOnly).toBe(0);
      expect(comparison.summary.remoteOnly).toBe(1);
      expect(comparison.summary.total).toBe(1);
      expect(comparison.files[0].status).toBe('remote_only');
      expect(comparison.files[0].remoteSize).toBeGreaterThan(0);
    });

    it('should handle complex directory structures', async () => {
      // Setup test directories
      const localPath = path.join(testFixturesDir, 'local');
      const remotePath = path.join(testFixturesDir, 'remote');

      await fs.mkdir(path.join(localPath, 'includes'), { recursive: true });
      await fs.mkdir(path.join(remotePath, 'includes'), { recursive: true });
      await fs.mkdir(path.join(localPath, 'assets'), { recursive: true });
      await fs.mkdir(path.join(remotePath, 'lib'), { recursive: true });

      // Create various files
      await fs.writeFile(path.join(localPath, 'main.php'), 'identical');
      await fs.writeFile(path.join(remotePath, 'main.php'), 'identical');

      await fs.writeFile(path.join(localPath, 'includes', 'helper.php'), 'local helper');
      await fs.writeFile(path.join(remotePath, 'includes', 'helper.php'), 'remote helper');

      await fs.mkdir(path.join(localPath, 'assets'), { recursive: true });
      await fs.writeFile(path.join(localPath, 'assets', 'style.css'), 'local only');
      await fs.mkdir(path.join(remotePath, 'lib'), { recursive: true });
      await fs.writeFile(path.join(remotePath, 'lib', 'library.php'), 'remote only');

      const comparison = await comparator.comparePlugins(localPath, remotePath);

      expect(comparison.summary.identical).toBe(1);
      expect(comparison.summary.different).toBe(1);
      expect(comparison.summary.localOnly).toBe(1);
      expect(comparison.summary.remoteOnly).toBe(1);
      expect(comparison.summary.total).toBe(4);
      expect(comparison.files).toHaveLength(4);
    });
  });

  describe('formatComparisonSummary', () => {
    it('should format comparison summary correctly', async () => {
      const mockComparison = {
        localPath: '/local/path',
        remotePath: '/remote/path',
        files: [
          { file: 'main.php', status: 'identical' as const, localSize: 100, remoteSize: 100 },
          { file: 'helper.php', status: 'different' as const, localSize: 200, remoteSize: 180 },
          { file: 'local.php', status: 'local_only' as const, localSize: 50 },
          { file: 'remote.php', status: 'remote_only' as const, remoteSize: 75 }
        ],
        summary: {
          identical: 1,
          different: 1,
          localOnly: 1,
          remoteOnly: 1,
          total: 4
        }
      };

      const formatted = comparator.formatComparisonSummary(mockComparison);

      expect(formatted).toContain('Plugin Comparison Summary');
      expect(formatted).toContain('Local:  /local/path');
      expect(formatted).toContain('Remote: /remote/path');
      expect(formatted).toContain('Identical:     1 files');
      expect(formatted).toContain('Different:     1 files');
      expect(formatted).toContain('Local only:    1 files');
      expect(formatted).toContain('Remote only:   1 files');
      expect(formatted).toContain('Total:         4 files');
      expect(formatted).toContain('Different Files:');
      expect(formatted).toContain('- helper.php');
      expect(formatted).toContain('Local Only Files:');
      expect(formatted).toContain('- local.php');
      expect(formatted).toContain('Remote Only Files:');
      expect(formatted).toContain('- remote.php');
    });
  });
});