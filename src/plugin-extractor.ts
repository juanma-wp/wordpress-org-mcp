import * as yauzl from 'yauzl';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { SystemPaths } from './system-paths.js';

/**
 * Represents a plugin that has been extracted from a ZIP file.
 * Contains metadata about the extraction location and included files.
 */
export interface ExtractedPlugin {
  /** The plugin slug identifier */
  slug: string;
  /** Absolute path to the directory where the plugin was extracted */
  extractPath: string;
  /** Array of relative file paths within the extracted plugin */
  files: string[];
}

/**
 * Utility class for extracting WordPress plugin ZIP files and analyzing their contents.
 * Handles ZIP file extraction, file listing, content reading, and directory structure analysis.
 */
export class PluginExtractor {
  /** Directory path where plugins are extracted */
  public readonly extractDir: string;

  /**
   * Initialize the plugin extractor.
   * @param extractDir - Optional custom extraction directory path. Uses system temp directory if not provided.
   */
  constructor(extractDir?: string) {
    this.extractDir = extractDir || SystemPaths.getTempDir();
  }

  /**
   * Ensure the extraction directory exists, creating it if necessary.
   * @throws Error if directory creation fails due to permissions or other issues
   */
  async ensureExtractDir(): Promise<void> {
    try {
      await fs.mkdir(this.extractDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Extract a plugin ZIP file to the extraction directory.
   * Cleans up any existing extraction before extracting the new version.
   * @param zipPath - Absolute path to the ZIP file to extract
   * @param slug - Plugin slug identifier for naming the extraction directory
   * @returns ExtractedPlugin object with extraction details, or null if extraction fails
   * @throws Error if ZIP file cannot be opened or extraction fails
   */
  async extractPlugin(zipPath: string, slug: string): Promise<ExtractedPlugin | null> {
    await this.ensureExtractDir();

    const extractPath = path.join(this.extractDir, slug);

    // Clean up existing extraction
    try {
      await fs.rm(extractPath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    await fs.mkdir(extractPath, { recursive: true });

    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        if (!zipfile) {
          reject(new Error('Failed to open zip file'));
          return;
        }

        const files: string[] = [];

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            const dirPath = path.join(extractPath, entry.fileName);
            fs.mkdir(dirPath, { recursive: true }).then(() => {
              zipfile.readEntry();
            }).catch(reject);
          } else {
            // File entry
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }

              if (!readStream) {
                reject(new Error('Failed to open read stream'));
                return;
              }

              const filePath = path.join(extractPath, entry.fileName);
              const dir = path.dirname(filePath);

              fs.mkdir(dir, { recursive: true }).then(() => {
                const writeStream = createWriteStream(filePath);

                pipeline(readStream, writeStream).then(() => {
                  files.push(entry.fileName);
                  zipfile.readEntry();
                }).catch(reject);
              }).catch(reject);
            });
          }
        });

        zipfile.on('end', () => {
          resolve({
            slug,
            extractPath,
            files
          });
        });

        zipfile.on('error', reject);
      });
    });
  }

  /**
   * Get a list of all files in an extracted plugin directory.
   * @param extractedPlugin - The extracted plugin to analyze
   * @param extension - Optional file extension filter (e.g., '.php', '.js')
   * @returns Array of relative file paths, optionally filtered by extension
   */
  async getPluginFiles(extractedPlugin: ExtractedPlugin, extension?: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(extractedPlugin.extractPath, fullPath);

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else {
          if (!extension || path.extname(entry.name) === extension) {
            files.push(relativePath);
          }
        }
      }
    }

    await walkDir(extractedPlugin.extractPath);
    return files.sort();
  }

  /**
   * Read the contents of a specific file from an extracted plugin.
   * @param extractedPlugin - The extracted plugin containing the file
   * @param filePath - Relative path to the file within the plugin directory
   * @returns File contents as a string, or null if file cannot be read
   */
  async readPluginFile(extractedPlugin: ExtractedPlugin, filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(extractedPlugin.extractPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Build a hierarchical structure representation of the plugin directory.
   * Creates a nested object representing the file system structure with file metadata.
   * @param extractedPlugin - The extracted plugin to analyze
   * @returns Nested object representing the directory structure with file metadata (size, modified date, extension)
   */
  async getPluginStructure(extractedPlugin: ExtractedPlugin): Promise<any> {
    const structure: any = {};

    async function buildStructure(dir: string, obj: any): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          obj[entry.name] = {};
          await buildStructure(fullPath, obj[entry.name]);
        } else {
          const stats = await fs.stat(fullPath);
          obj[entry.name] = {
            size: stats.size,
            modified: stats.mtime,
            extension: path.extname(entry.name)
          };
        }
      }
    }

    await buildStructure(extractedPlugin.extractPath, structure);
    return structure;
  }
}