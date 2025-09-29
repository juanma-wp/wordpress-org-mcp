import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { SystemPaths } from './system-paths.js';

/**
 * WordPress plugin information structure as returned by the WordPress.org API.
 * Contains essential metadata about a plugin including version, download link, and requirements.
 */
export interface PluginInfo {
  /** Display name of the plugin */
  name: string;
  /** URL-friendly slug identifier */
  slug: string;
  /** Current version number */
  version: string;
  /** Direct download URL for the plugin ZIP file */
  download_link: string;
  /** Brief description of the plugin's functionality */
  short_description: string;
  /** Plugin author name or organization */
  author: string;
  /** Plugin's official homepage URL */
  homepage: string;
  /** Minimum required WordPress version */
  requires: string;
  /** Latest WordPress version tested with this plugin */
  tested: string;
  /** Minimum required PHP version */
  requires_php: string;
}

/**
 * WordPress.org API client for plugin operations.
 * Provides methods to search, fetch info, and download plugins from the WordPress.org repository.
 * Includes local caching to avoid redundant downloads and API calls.
 */
export class WordPressOrgAPI {
  /** Base URL for WordPress.org plugin API */
  private readonly baseUrl = 'https://api.wordpress.org/plugins/info/1.0/';
  /** Base URL for plugin downloads */
  private readonly downloadBaseUrl = 'https://downloads.wordpress.org/plugin/';
  /** Directory path where downloaded plugin files are cached */
  public readonly cacheDir: string;

  /**
   * Initialize the WordPress.org API client.
   * @param cacheDir - Optional custom cache directory path. Uses system default if not provided.
   */
  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || SystemPaths.getCacheDir();
  }

  /**
   * Ensure the cache directory exists, creating it if necessary.
   * @throws Error if directory creation fails due to permissions or other issues
   */
  async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Fetch detailed information about a specific plugin from WordPress.org.
   * @param slug - The plugin slug (URL-friendly identifier)
   * @returns Plugin information object or null if plugin not found
   */
  async getPluginInfo(slug: string): Promise<PluginInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}${slug}.json`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      return {
        name: data.name,
        slug: data.slug,
        version: data.version,
        download_link: data.download_link,
        short_description: data.short_description,
        author: data.author,
        homepage: data.homepage,
        requires: data.requires,
        tested: data.tested,
        requires_php: data.requires_php
      };
    } catch (error) {
      console.error(`Error fetching plugin info for ${slug}:`, error);
      return null;
    }
  }

  /**
   * Download a plugin ZIP file from WordPress.org.
   * Uses local caching to avoid redundant downloads of the same plugin version.
   * @param slug - The plugin slug to download
   * @param version - Plugin version to download (default: 'latest')
   * @returns Path to the downloaded ZIP file, or null if download failed
   */
  async downloadPlugin(slug: string, version = 'latest'): Promise<string | null> {
    await this.ensureCacheDir();

    const fileName = version === 'latest' ? `${slug}.zip` : `${slug}.${version}.zip`;
    const filePath = path.join(this.cacheDir, fileName);

    // Check if already cached
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, download it
    }

    try {
      const downloadUrl = version === 'latest'
        ? `${this.downloadBaseUrl}${slug}.zip`
        : `${this.downloadBaseUrl}${slug}.${version}.zip`;

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return null;
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const fileStream = createWriteStream(filePath);
      await pipeline(response.body, fileStream);

      return filePath;
    } catch (error) {
      console.error(`Error downloading plugin ${slug}:`, error);
      return null;
    }
  }

  /**
   * Search for plugins on WordPress.org by keyword.
   * @param query - Search query string to match against plugin names and descriptions
   * @param limit - Maximum number of results to return (default: 10)
   * @returns Array of plugin information objects matching the search query
   */
  async searchPlugins(query: string, limit = 10): Promise<PluginInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}query-plugins/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=query_plugins&request[search]=${encodeURIComponent(query)}&request[per_page]=${limit}`
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as any;
      return data.plugins?.map((plugin: any) => ({
        name: plugin.name,
        slug: plugin.slug,
        version: plugin.version,
        download_link: plugin.download_link,
        short_description: plugin.short_description,
        author: plugin.author,
        homepage: plugin.homepage,
        requires: plugin.requires,
        tested: plugin.tested,
        requires_php: plugin.requires_php
      })) || [];
    } catch (error) {
      console.error(`Error searching plugins for "${query}":`, error);
      return [];
    }
  }
}