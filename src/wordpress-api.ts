import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { SystemPaths } from './system-paths.js';

export interface PluginInfo {
  name: string;
  slug: string;
  version: string;
  download_link: string;
  short_description: string;
  author: string;
  homepage: string;
  requires: string;
  tested: string;
  requires_php: string;
}

export class WordPressOrgAPI {
  private readonly baseUrl = 'https://api.wordpress.org/plugins/info/1.0/';
  private readonly downloadBaseUrl = 'https://downloads.wordpress.org/plugin/';
  public readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || SystemPaths.getCacheDir();
  }

  async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

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