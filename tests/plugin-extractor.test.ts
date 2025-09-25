import { PluginExtractor } from '../src/plugin-extractor';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock yauzl with simpler approach
const mockYauzl = {
  open: jest.fn(),
};
jest.doMock('yauzl', () => mockYauzl);

describe('PluginExtractor', () => {
  let extractor: PluginExtractor;
  const testExtractDir = './test-extracted';
  const testFixturesDir = './test-fixtures';

  beforeEach(() => {
    extractor = new PluginExtractor(testExtractDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await fs.rm(testExtractDir, { recursive: true, force: true });
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Directories might not exist
    }
  });

  describe('ensureExtractDir', () => {
    it('should create extract directory', async () => {
      await extractor.ensureExtractDir();

      const stats = await fs.stat(testExtractDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not fail if directory already exists', async () => {
      await fs.mkdir(testExtractDir, { recursive: true });

      await expect(extractor.ensureExtractDir()).resolves.not.toThrow();
    });
  });

  describe('extractPlugin - simplified tests', () => {
    it('should handle extraction errors gracefully', async () => {
      mockYauzl.open.mockImplementation((zipPath: string, options: any, callback: any) => {
        callback(new Error('Failed to open zip file'), null);
      });

      await expect(extractor.extractPlugin('/path/to/bad.zip', 'test-plugin'))
        .rejects.toThrow();

      // Note: Mock might not be called due to file system checks
    });

    it('should handle missing zipfile', async () => {
      mockYauzl.open.mockImplementation((zipPath: string, options: any, callback: any) => {
        callback(null, null);
      });

      await expect(extractor.extractPlugin('/path/to/test.zip', 'test-plugin'))
        .rejects.toThrow();
    });
  });

  describe('getPluginFiles', () => {
    it('should list all files in extracted plugin', async () => {
      const extractPath = path.join(testFixturesDir, 'test-plugin');
      await fs.mkdir(extractPath, { recursive: true });
      await fs.writeFile(path.join(extractPath, 'main.php'), 'test content');
      await fs.writeFile(path.join(extractPath, 'readme.txt'), 'readme content');
      await fs.mkdir(path.join(extractPath, 'includes'), { recursive: true });
      await fs.writeFile(path.join(extractPath, 'includes', 'helper.php'), 'helper content');

      const extractedPlugin = {
        slug: 'test-plugin',
        extractPath,
        files: []
      };

      const files = await extractor.getPluginFiles(extractedPlugin);

      expect(files).toEqual([
        'includes/helper.php',
        'main.php',
        'readme.txt'
      ]);
    });

    it('should filter files by extension', async () => {
      const extractPath = path.join(testFixturesDir, 'test-plugin');
      await fs.mkdir(extractPath, { recursive: true });
      await fs.writeFile(path.join(extractPath, 'main.php'), 'test content');
      await fs.writeFile(path.join(extractPath, 'readme.txt'), 'readme content');
      await fs.writeFile(path.join(extractPath, 'style.css'), 'css content');

      const extractedPlugin = {
        slug: 'test-plugin',
        extractPath,
        files: []
      };

      const phpFiles = await extractor.getPluginFiles(extractedPlugin, '.php');

      expect(phpFiles).toEqual(['main.php']);
    });
  });

  describe('readPluginFile', () => {
    it('should read file content', async () => {
      const extractPath = path.join(testFixturesDir, 'test-plugin');
      await fs.mkdir(extractPath, { recursive: true });
      const fileContent = 'Test file content';
      await fs.writeFile(path.join(extractPath, 'test.txt'), fileContent);

      const extractedPlugin = {
        slug: 'test-plugin',
        extractPath,
        files: []
      };

      const content = await extractor.readPluginFile(extractedPlugin, 'test.txt');

      expect(content).toBe(fileContent);
    });

    it('should return null for non-existent file', async () => {
      const extractPath = path.join(testFixturesDir, 'test-plugin');
      await fs.mkdir(extractPath, { recursive: true });

      const extractedPlugin = {
        slug: 'test-plugin',
        extractPath,
        files: []
      };

      // Suppress console.error for this test since it's expected
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const content = await extractor.readPluginFile(extractedPlugin, 'non-existent.txt');

      expect(content).toBeNull();

      // Restore console.error
      consoleError.mockRestore();
    });
  });

  describe('getPluginStructure', () => {
    it('should build plugin directory structure', async () => {
      const extractPath = path.join(testFixturesDir, 'test-plugin');
      await fs.mkdir(path.join(extractPath, 'includes'), { recursive: true });
      await fs.writeFile(path.join(extractPath, 'main.php'), 'main content');
      await fs.writeFile(path.join(extractPath, 'includes', 'helper.php'), 'helper content');

      const extractedPlugin = {
        slug: 'test-plugin',
        extractPath,
        files: []
      };

      const structure = await extractor.getPluginStructure(extractedPlugin);

      expect(structure['main.php']).toBeDefined();
      expect(structure).toHaveProperty('includes');
      expect(structure.includes['helper.php']).toBeDefined();
      expect(structure['main.php']).toMatchObject({
        size: expect.any(Number),
        extension: '.php'
      });
      expect(typeof structure['main.php'].modified).toBe('object');
    });

    it('should handle empty directories', async () => {
      const extractPath = path.join(testFixturesDir, 'empty-plugin');
      await fs.mkdir(extractPath, { recursive: true });

      const extractedPlugin = {
        slug: 'empty-plugin',
        extractPath,
        files: []
      };

      const structure = await extractor.getPluginStructure(extractedPlugin);

      expect(structure).toEqual({});
    });
  });

  describe('extractDir property', () => {
    it('should expose extractDir property', () => {
      expect(extractor.extractDir).toBe(testExtractDir);
    });

    it('should use default extract directory when not specified', () => {
      const defaultExtractor = new PluginExtractor();
      expect(defaultExtractor.extractDir).toBeDefined();
      expect(typeof defaultExtractor.extractDir).toBe('string');
    });
  });
});