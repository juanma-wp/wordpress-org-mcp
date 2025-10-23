import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { PluginExtractor, ExtractedPlugin } from './plugin-extractor.js';
import { SystemPaths } from './system-paths.js';

const execAsync = promisify(exec);

/**
 * Information about a plugin's source code repository
 */
export interface RepositoryInfo {
  /** Type of repository (github, gitlab, bitbucket, svn, etc.) */
  type: 'github' | 'gitlab' | 'bitbucket' | 'svn' | 'unknown';
  /** Full URL to the repository */
  url: string;
  /** Organization or username */
  owner?: string;
  /** Repository name */
  repo?: string;
  /** Default branch (if known) */
  branch?: string;
}

/**
 * Result of downloading a repository
 */
export interface RepositoryDownload {
  /** Path where the repository was cloned */
  path: string;
  /** Repository information */
  info: RepositoryInfo;
  /** List of files in the repository */
  files: string[];
}

/**
 * Utility class for extracting repository URLs from WordPress plugins
 * and downloading the original source code.
 */
export class RepositoryExtractor {
  private repoDir: string;
  private extractor: PluginExtractor;

  constructor(repoDir?: string) {
    this.repoDir = repoDir || path.join(SystemPaths.getTempDir(), 'repositories');
    this.extractor = new PluginExtractor();
  }

  /**
   * Ensure the repository directory exists
   */
  private async ensureRepoDir(): Promise<void> {
    await fs.mkdir(this.repoDir, { recursive: true });
  }

  /**
   * Extract repository URL from plugin files
   * Searches through common locations where repository URLs are stored
   */
  async findRepositoryUrl(extractedPlugin: ExtractedPlugin): Promise<RepositoryInfo | null> {
    const patterns = [
      // GitHub patterns
      /github\.com[\/:]([^\/\s]+)\/([^\/\s\.]+)/gi,
      // GitLab patterns
      /gitlab\.com[\/:]([^\/\s]+)\/([^\/\s\.]+)/gi,
      // Bitbucket patterns
      /bitbucket\.org[\/:]([^\/\s]+)\/([^\/\s\.]+)/gi,
      // Generic git URL patterns
      /git@([^:]+):([^\/]+)\/([^\.]+)/gi,
      // HTTPS git URLs
      /https?:\/\/(github|gitlab|bitbucket)\.[^\/]+\/([^\/\s]+)\/([^\/\s\.]+)/gi
    ];

    // Files to search for repository URLs
    const searchFiles = [
      'readme.txt',
      'README.txt',
      'readme.md',
      'README.md',
      'composer.json',
      'package.json',
      '.git/config',
      'style.css'  // WordPress theme files often contain repo info
    ];

    // Also search main PHP files
    const phpFiles = await this.extractor.getPluginFiles(extractedPlugin, '.php');
    const mainPhpFile = phpFiles.find(f =>
      f === `${extractedPlugin.slug}.php` ||
      f === 'plugin.php' ||
      f === 'index.php' ||
      f === 'main.php'
    );
    if (mainPhpFile) {
      searchFiles.push(mainPhpFile);
    }

    for (const file of searchFiles) {
      const content = await this.extractor.readPluginFile(extractedPlugin, file);
      if (!content) continue;

      // Check for repository URLs in the content
      for (const pattern of patterns) {
        pattern.lastIndex = 0; // Reset regex
        const matches = pattern.exec(content);
        if (matches) {
          return this.parseRepositoryUrl(matches[0]);
        }
      }

      // Special handling for composer.json and package.json
      if (file === 'composer.json' || file === 'package.json') {
        try {
          const json = JSON.parse(content);

          // Check various possible locations for repo URL
          const repoUrl =
            json.repository?.url ||
            json.repository?.git ||
            json.repository ||
            json.homepage ||
            json.bugs?.url;

          if (repoUrl && typeof repoUrl === 'string') {
            const info = this.parseRepositoryUrl(repoUrl);
            if (info) return info;
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    return null;
  }

  /**
   * Parse a repository URL and extract information
   */
  private parseRepositoryUrl(url: string): RepositoryInfo | null {
    // Clean up the URL
    url = url.trim()
      .replace(/\.git$/, '')
      .replace(/^git@/, 'https://')
      .replace(/^git:\/\//, 'https://')
      .replace(/:([^\/])/, '/$1'); // Convert SSH format to HTTPS

    // GitHub
    const githubMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\s\.]+)/i);
    if (githubMatch) {
      return {
        type: 'github',
        url: `https://github.com/${githubMatch[1]}/${githubMatch[2]}`,
        owner: githubMatch[1],
        repo: githubMatch[2],
        branch: 'main' // Will try 'master' as fallback
      };
    }

    // GitLab
    const gitlabMatch = url.match(/gitlab\.com[\/:]([^\/]+)\/([^\/\s\.]+)/i);
    if (gitlabMatch) {
      return {
        type: 'gitlab',
        url: `https://gitlab.com/${gitlabMatch[1]}/${gitlabMatch[2]}`,
        owner: gitlabMatch[1],
        repo: gitlabMatch[2],
        branch: 'main'
      };
    }

    // Bitbucket
    const bitbucketMatch = url.match(/bitbucket\.org[\/:]([^\/]+)\/([^\/\s\.]+)/i);
    if (bitbucketMatch) {
      return {
        type: 'bitbucket',
        url: `https://bitbucket.org/${bitbucketMatch[1]}/${bitbucketMatch[2]}`,
        owner: bitbucketMatch[1],
        repo: bitbucketMatch[2],
        branch: 'master'
      };
    }

    // WordPress SVN
    if (url.includes('plugins.svn.wordpress.org')) {
      const svnMatch = url.match(/plugins\.svn\.wordpress\.org\/([^\/]+)/i);
      if (svnMatch) {
        return {
          type: 'svn',
          url: `https://plugins.svn.wordpress.org/${svnMatch[1]}/trunk/`,
          repo: svnMatch[1]
        };
      }
    }

    // Generic URL
    if (url.startsWith('http')) {
      return {
        type: 'unknown',
        url: url
      };
    }

    return null;
  }

  /**
   * Download repository using git clone or svn checkout
   */
  async downloadRepository(repoInfo: RepositoryInfo, slug: string): Promise<RepositoryDownload> {
    await this.ensureRepoDir();

    const repoPath = path.join(this.repoDir, `${slug}-repo`);

    // Clean up existing clone
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    try {
      if (repoInfo.type === 'svn') {
        // Use svn for WordPress.org repositories
        await execAsync(`svn checkout "${repoInfo.url}" "${repoPath}"`, {
          timeout: 60000 // 1 minute timeout
        });
      } else {
        // Try git clone
        let cloneSuccess = false;
        const branches = repoInfo.branch ? [repoInfo.branch, 'master', 'main'] : ['main', 'master'];

        for (const branch of branches) {
          try {
            await execAsync(`git clone --depth 1 --branch ${branch} "${repoInfo.url}" "${repoPath}"`, {
              timeout: 60000
            });
            cloneSuccess = true;
            repoInfo.branch = branch;
            break;
          } catch {
            // Try next branch
          }
        }

        if (!cloneSuccess) {
          // Try without specifying branch
          await execAsync(`git clone --depth 1 "${repoInfo.url}" "${repoPath}"`, {
            timeout: 60000
          });
        }
      }

      // Get list of files
      const files = await this.getRepositoryFiles(repoPath);

      return {
        path: repoPath,
        info: repoInfo,
        files
      };
    } catch (error: any) {
      throw new Error(`Failed to download repository: ${error.message}`);
    }
  }

  /**
   * Download repository using HTTP (fallback for when git/svn is not available)
   */
  async downloadRepositoryViaHttp(repoInfo: RepositoryInfo, slug: string): Promise<RepositoryDownload> {
    await this.ensureRepoDir();

    const repoPath = path.join(this.repoDir, `${slug}-repo`);

    // Clean up existing download
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    // Generate download URL based on repository type
    let downloadUrl: string | null = null;

    if (repoInfo.type === 'github' && repoInfo.owner && repoInfo.repo) {
      // GitHub archive download
      const branch = repoInfo.branch || 'main';
      downloadUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/zipball/${branch}`;
    } else if (repoInfo.type === 'gitlab' && repoInfo.owner && repoInfo.repo) {
      // GitLab archive download
      const branch = repoInfo.branch || 'main';
      downloadUrl = `https://gitlab.com/${repoInfo.owner}/${repoInfo.repo}/-/archive/${branch}/${repoInfo.repo}-${branch}.zip`;
    } else if (repoInfo.type === 'bitbucket' && repoInfo.owner && repoInfo.repo) {
      // Bitbucket download
      const branch = repoInfo.branch || 'master';
      downloadUrl = `https://bitbucket.org/${repoInfo.owner}/${repoInfo.repo}/get/${branch}.zip`;
    }

    if (!downloadUrl) {
      throw new Error(`Cannot download repository via HTTP for type: ${repoInfo.type}`);
    }

    // Download the archive
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'WordPress-MCP-Server/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download repository: ${response.statusText}`);
    }

    // Save to temp file
    const tempZip = path.join(this.repoDir, `${slug}-temp.zip`);
    const buffer = await response.buffer();
    await fs.writeFile(tempZip, buffer);

    // Extract using the plugin extractor
    const extracted = await this.extractor.extractPlugin(tempZip, slug + '-repo-temp');

    if (!extracted) {
      throw new Error('Failed to extract repository archive');
    }

    // Move to final location (handle nested directory structure)
    const entries = await fs.readdir(extracted.extractPath, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
      // Archive has a single root directory, move its contents
      const rootDir = path.join(extracted.extractPath, entries[0].name);
      await fs.rename(rootDir, repoPath);
    } else {
      // Archive has multiple items at root
      await fs.rename(extracted.extractPath, repoPath);
    }

    // Clean up temp file
    await fs.unlink(tempZip).catch(() => {});

    // Get list of files
    const files = await this.getRepositoryFiles(repoPath);

    return {
      path: repoPath,
      info: repoInfo,
      files
    };
  }

  /**
   * Get all files in a repository
   */
  private async getRepositoryFiles(repoPath: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string, basePath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(basePath, fullPath);

          // Skip .git and .svn directories
          if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== '.svn' && entry.name !== 'node_modules') {
              await walkDir(fullPath, basePath);
            }
          } else {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Directory might not be accessible
      }
    }

    await walkDir(repoPath, repoPath);
    return files.sort();
  }

  /**
   * Compare JS and CSS files between plugin and repository
   */
  async compareAssets(extractedPlugin: ExtractedPlugin, repoDownload: RepositoryDownload): Promise<{
    jsFiles: Array<{ file: string; inPlugin: boolean; inRepo: boolean; }>;
    cssFiles: Array<{ file: string; inPlugin: boolean; inRepo: boolean; }>;
  }> {
    // Get JS and CSS files from plugin
    const pluginJsFiles = await this.extractor.getPluginFiles(extractedPlugin, '.js');
    const pluginCssFiles = await this.extractor.getPluginFiles(extractedPlugin, '.css');

    // Get JS and CSS files from repository
    const repoJsFiles = repoDownload.files.filter(f => f.endsWith('.js'));
    const repoCssFiles = repoDownload.files.filter(f => f.endsWith('.css'));

    // Create comparison lists
    const allJsFiles = new Set([...pluginJsFiles, ...repoJsFiles]);
    const allCssFiles = new Set([...pluginCssFiles, ...repoCssFiles]);

    const jsComparison = Array.from(allJsFiles).map(file => ({
      file,
      inPlugin: pluginJsFiles.includes(file),
      inRepo: repoJsFiles.includes(file)
    }));

    const cssComparison = Array.from(allCssFiles).map(file => ({
      file,
      inPlugin: pluginCssFiles.includes(file),
      inRepo: repoCssFiles.includes(file)
    }));

    return {
      jsFiles: jsComparison.sort((a, b) => a.file.localeCompare(b.file)),
      cssFiles: cssComparison.sort((a, b) => a.file.localeCompare(b.file))
    };
  }
}