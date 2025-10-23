import * as diff from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Represents the comparison result for a single file between two plugin versions.
 * Contains the comparison status and optional diff information.
 */
export interface FileComparison {
  /** Relative path of the file within the plugin directory */
  file: string;
  /** Comparison status indicating how the file differs between versions */
  status: 'identical' | 'different' | 'local_only' | 'remote_only';
  /** Unified diff string showing the differences (only present for 'different' status) */
  diff?: string;
  /** Size of the file in the local version (in bytes) */
  localSize?: number;
  /** Size of the file in the remote version (in bytes) */
  remoteSize?: number;
}

/**
 * Represents the complete comparison result between two plugin versions.
 * Contains individual file comparisons and summary statistics.
 */
export interface PluginComparison {
  /** Absolute path to the local plugin directory */
  localPath: string;
  /** Absolute path to the remote plugin directory */
  remotePath: string;
  /** Array of individual file comparison results */
  files: FileComparison[];
  /** Summary statistics of the comparison */
  summary: {
    /** Number of files that are identical between versions */
    identical: number;
    /** Number of files that have differences between versions */
    different: number;
    /** Number of files that exist only in the local version */
    localOnly: number;
    /** Number of files that exist only in the remote version */
    remoteOnly: number;
    /** Total number of files compared */
    total: number;
  };
}

/**
 * Utility class for comparing WordPress plugin directories and generating detailed diffs.
 * Provides methods to compare plugin versions, analyze file differences, and format results.
 */
export class PluginComparator {
  /**
   * Compare two plugin directories and generate a detailed comparison report.
   * Analyzes all files in both directories and categorizes them as identical, different, or unique to one version.
   * @param localPluginPath - Absolute path to the local plugin directory
   * @param remotePluginPath - Absolute path to the remote plugin directory
   * @returns Complete comparison result with individual file analyses and summary statistics
   */
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

  /**
   * Recursively get all files in a plugin directory.
   * @param pluginPath - Absolute path to the plugin directory
   * @returns Array of relative file paths within the plugin directory
   */
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

  /**
   * Compare two individual files and generate a detailed comparison.
   * @param localPath - Absolute path to the local file
   * @param remotePath - Absolute path to the remote file
   * @param fileName - Relative filename for the comparison result
   * @returns FileComparison object with status and optional diff
   */
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

  /**
   * Get the file size in bytes for a given file path.
   * @param filePath - Absolute path to the file
   * @returns File size in bytes, or undefined if file cannot be accessed
   */
  private async getFileSize(filePath: string): Promise<number | undefined> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return undefined;
    }
  }

  /**
   * Compare specific file types between two plugin directories.
   * Provides detailed comparison for JavaScript and CSS files.
   * @param localPluginPath - Absolute path to the local plugin directory
   * @param remotePluginPath - Absolute path to the remote plugin directory
   * @param fileTypes - Array of file extensions to compare (e.g., ['.js', '.css'])
   * @returns Comparison result filtered by file types with additional analysis
   */
  async compareAssetFiles(
    localPluginPath: string,
    remotePluginPath: string,
    fileTypes: string[] = ['.js', '.css']
  ): Promise<{
    comparison: PluginComparison;
    analysis: {
      minified: { local: string[]; remote: string[] };
      sourceMaps: { local: string[]; remote: string[] };
      buildArtifacts: { local: string[]; remote: string[] };
      originalSources: { local: string[]; remote: string[] };
    };
  }> {
    // Get full comparison
    const comparison = await this.comparePlugins(localPluginPath, remotePluginPath);

    // Filter for requested file types
    const filteredFiles = comparison.files.filter(f =>
      fileTypes.some(ext => f.file.endsWith(ext))
    );

    // Analyze the files
    const analysis = {
      minified: { local: [] as string[], remote: [] as string[] },
      sourceMaps: { local: [] as string[], remote: [] as string[] },
      buildArtifacts: { local: [] as string[], remote: [] as string[] },
      originalSources: { local: [] as string[], remote: [] as string[] }
    };

    for (const file of filteredFiles) {
      const isMinified = file.file.includes('.min.') || file.file.includes('-min.');
      const isSourceMap = file.file.endsWith('.map');
      const isBuildArtifact = file.file.includes('/dist/') || file.file.includes('/build/') ||
                             file.file.includes('/assets/') || file.file.includes('/public/');

      if (file.status === 'local_only') {
        if (isMinified) {
          analysis.minified.local.push(file.file);
        } else if (isSourceMap) {
          analysis.sourceMaps.local.push(file.file);
        } else if (isBuildArtifact) {
          analysis.buildArtifacts.local.push(file.file);
        } else {
          analysis.originalSources.local.push(file.file);
        }
      } else if (file.status === 'remote_only') {
        if (isMinified) {
          analysis.minified.remote.push(file.file);
        } else if (isSourceMap) {
          analysis.sourceMaps.remote.push(file.file);
        } else if (isBuildArtifact) {
          analysis.buildArtifacts.remote.push(file.file);
        } else {
          analysis.originalSources.remote.push(file.file);
        }
      }
    }

    // Update comparison with filtered files
    const filteredComparison: PluginComparison = {
      ...comparison,
      files: filteredFiles,
      summary: {
        identical: filteredFiles.filter(f => f.status === 'identical').length,
        different: filteredFiles.filter(f => f.status === 'different').length,
        localOnly: filteredFiles.filter(f => f.status === 'local_only').length,
        remoteOnly: filteredFiles.filter(f => f.status === 'remote_only').length,
        total: filteredFiles.length
      }
    };

    return {
      comparison: filteredComparison,
      analysis
    };
  }

  /**
   * Format a plugin comparison result into a human-readable summary report.
   * Creates a nicely formatted text report with statistics and file listings.
   * @param comparison - The plugin comparison result to format
   * @returns Formatted summary report as a multi-line string
   */
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