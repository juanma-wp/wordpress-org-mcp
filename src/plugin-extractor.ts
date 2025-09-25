import * as yauzl from 'yauzl';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { SystemPaths } from './system-paths.js';

export interface ExtractedPlugin {
  slug: string;
  extractPath: string;
  files: string[];
}

export class PluginExtractor {
  public readonly extractDir: string;

  constructor(extractDir?: string) {
    this.extractDir = extractDir || SystemPaths.getTempDir();
  }

  async ensureExtractDir(): Promise<void> {
    try {
      await fs.mkdir(this.extractDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

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