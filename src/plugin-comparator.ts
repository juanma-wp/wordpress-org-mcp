import * as diff from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileComparison {
  file: string;
  status: 'identical' | 'different' | 'local_only' | 'remote_only';
  diff?: string;
  localSize?: number;
  remoteSize?: number;
}

export interface PluginComparison {
  localPath: string;
  remotePath: string;
  files: FileComparison[];
  summary: {
    identical: number;
    different: number;
    localOnly: number;
    remoteOnly: number;
    total: number;
  };
}

export class PluginComparator {
  async comparePlugins(localPluginPath: string, remotePluginPath: string): Promise<PluginComparison> {
    const localFiles = await this.getPluginFiles(localPluginPath);
    const remoteFiles = await this.getPluginFiles(remotePluginPath);

    const allFiles = new Set([...localFiles, ...remoteFiles]);
    const comparisons: FileComparison[] = [];

    let identical = 0;
    let different = 0;
    let localOnly = 0;
    let remoteOnly = 0;

    for (const file of allFiles) {
      const localFilePath = path.join(localPluginPath, file);
      const remoteFilePath = path.join(remotePluginPath, file);

      const localExists = localFiles.includes(file);
      const remoteExists = remoteFiles.includes(file);

      if (!localExists) {
        comparisons.push({
          file,
          status: 'remote_only',
          remoteSize: await this.getFileSize(remoteFilePath)
        });
        remoteOnly++;
      } else if (!remoteExists) {
        comparisons.push({
          file,
          status: 'local_only',
          localSize: await this.getFileSize(localFilePath)
        });
        localOnly++;
      } else {
        const comparison = await this.compareFiles(localFilePath, remoteFilePath, file);
        comparisons.push(comparison);

        if (comparison.status === 'identical') {
          identical++;
        } else {
          different++;
        }
      }
    }

    return {
      localPath: localPluginPath,
      remotePath: remotePluginPath,
      files: comparisons.sort((a, b) => a.file.localeCompare(b.file)),
      summary: {
        identical,
        different,
        localOnly,
        remoteOnly,
        total: allFiles.size
      }
    };
  }

  private async getPluginFiles(pluginPath: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string, basePath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(basePath, fullPath);

          if (entry.isDirectory()) {
            await walkDir(fullPath, basePath);
          } else {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Directory might not exist or be accessible
      }
    }

    await walkDir(pluginPath, pluginPath);
    return files.sort();
  }

  private async compareFiles(localPath: string, remotePath: string, fileName: string): Promise<FileComparison> {
    try {
      const [localContent, remoteContent] = await Promise.all([
        fs.readFile(localPath, 'utf-8'),
        fs.readFile(remotePath, 'utf-8')
      ]);

      const [localSize, remoteSize] = await Promise.all([
        this.getFileSize(localPath),
        this.getFileSize(remotePath)
      ]);

      if (localContent === remoteContent) {
        return {
          file: fileName,
          status: 'identical',
          localSize,
          remoteSize
        };
      } else {
        const fileDiff = diff.createPatch(fileName, remoteContent, localContent, 'WordPress.org', 'Local');
        return {
          file: fileName,
          status: 'different',
          diff: fileDiff,
          localSize,
          remoteSize
        };
      }
    } catch (error) {
      // Handle binary files or read errors
      const [localSize, remoteSize] = await Promise.all([
        this.getFileSize(localPath),
        this.getFileSize(remotePath)
      ]);

      return {
        file: fileName,
        status: localSize === remoteSize ? 'identical' : 'different',
        localSize,
        remoteSize
      };
    }
  }

  private async getFileSize(filePath: string): Promise<number | undefined> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return undefined;
    }
  }

  formatComparisonSummary(comparison: PluginComparison): string {
    const { summary } = comparison;

    let output = `Plugin Comparison Summary\n`;
    output += `=========================\n\n`;
    output += `Local:  ${comparison.localPath}\n`;
    output += `Remote: ${comparison.remotePath}\n\n`;
    output += `Files Analysis:\n`;
    output += `- Identical:   ${summary.identical.toString().padStart(3)} files\n`;
    output += `- Different:   ${summary.different.toString().padStart(3)} files\n`;
    output += `- Local only:  ${summary.localOnly.toString().padStart(3)} files\n`;
    output += `- Remote only: ${summary.remoteOnly.toString().padStart(3)} files\n`;
    output += `- Total:       ${summary.total.toString().padStart(3)} files\n\n`;

    if (summary.different > 0) {
      output += `Different Files:\n`;
      comparison.files
        .filter(f => f.status === 'different')
        .forEach(f => {
          output += `- ${f.file}\n`;
        });
      output += `\n`;
    }

    if (summary.localOnly > 0) {
      output += `Local Only Files:\n`;
      comparison.files
        .filter(f => f.status === 'local_only')
        .forEach(f => {
          output += `- ${f.file}\n`;
        });
      output += `\n`;
    }

    if (summary.remoteOnly > 0) {
      output += `Remote Only Files:\n`;
      comparison.files
        .filter(f => f.status === 'remote_only')
        .forEach(f => {
          output += `- ${f.file}\n`;
        });
      output += `\n`;
    }

    return output;
  }
}