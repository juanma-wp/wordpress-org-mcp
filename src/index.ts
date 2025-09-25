#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { WordPressOrgAPI } from './wordpress-api.js';
import { PluginExtractor } from './plugin-extractor.js';
import { PluginComparator } from './plugin-comparator.js';
import * as path from 'path';

export class WordPressOrgMCPServer {
  protected server: Server;
  private api: WordPressOrgAPI;
  private extractor: PluginExtractor;
  private comparator: PluginComparator;

  constructor() {
    this.server = new Server(
      {
        name: 'wordpress-org-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Support custom paths via environment variables
    const customCacheDir = process.env.WP_MCP_CACHE_DIR;
    const customExtractDir = process.env.WP_MCP_EXTRACT_DIR;

    this.api = new WordPressOrgAPI(customCacheDir);
    this.extractor = new PluginExtractor(customExtractDir);
    this.comparator = new PluginComparator();

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_plugins',
          description: 'Search for WordPress.org plugins by keyword',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for plugins'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10)',
                default: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_plugin_info',
          description: 'Get detailed information about a specific plugin',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug (e.g., "jwt-authentication-for-wp-rest-api")'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'download_plugin',
          description: 'Download a plugin from WordPress.org',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug to download'
              },
              version: {
                type: 'string',
                description: 'Plugin version (default: "latest")',
                default: 'latest'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'extract_plugin',
          description: 'Extract a downloaded plugin ZIP file',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug to extract'
              },
              zip_path: {
                type: 'string',
                description: 'Path to the plugin ZIP file (optional if already downloaded)'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'list_plugin_files',
          description: 'List files in an extracted plugin',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug'
              },
              extension: {
                type: 'string',
                description: 'Filter by file extension (e.g., ".php", ".js")'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'read_plugin_file',
          description: 'Read the contents of a specific file from an extracted plugin',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug'
              },
              file_path: {
                type: 'string',
                description: 'Relative path to the file within the plugin'
              }
            },
            required: ['slug', 'file_path']
          }
        },
        {
          name: 'compare_plugins',
          description: 'Compare a local plugin with a WordPress.org plugin',
          inputSchema: {
            type: 'object',
            properties: {
              local_path: {
                type: 'string',
                description: 'Path to local plugin directory'
              },
              wp_org_slug: {
                type: 'string',
                description: 'WordPress.org plugin slug to compare against'
              },
              format: {
                type: 'string',
                enum: ['summary', 'detailed'],
                description: 'Output format (default: "summary")',
                default: 'summary'
              }
            },
            required: ['local_path', 'wp_org_slug']
          }
        },
        {
          name: 'get_file_diff',
          description: 'Get detailed diff for a specific file between local and WordPress.org plugin',
          inputSchema: {
            type: 'object',
            properties: {
              local_path: {
                type: 'string',
                description: 'Path to local plugin directory'
              },
              wp_org_slug: {
                type: 'string',
                description: 'WordPress.org plugin slug'
              },
              file_path: {
                type: 'string',
                description: 'Relative path to the file to diff'
              }
            },
            required: ['local_path', 'wp_org_slug', 'file_path']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'search_plugins':
            return await this.handleSearchPlugins(args);
          case 'get_plugin_info':
            return await this.handleGetPluginInfo(args);
          case 'download_plugin':
            return await this.handleDownloadPlugin(args);
          case 'extract_plugin':
            return await this.handleExtractPlugin(args);
          case 'list_plugin_files':
            return await this.handleListPluginFiles(args);
          case 'read_plugin_file':
            return await this.handleReadPluginFile(args);
          case 'compare_plugins':
            return await this.handleComparePlugins(args);
          case 'get_file_diff':
            return await this.handleGetFileDiff(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
      }
    });
  }

  private async handleSearchPlugins(args: any) {
    const { query, limit = 10 } = args;
    const plugins = await this.api.searchPlugins(query, limit);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(plugins, null, 2)
        }
      ]
    };
  }

  private async handleGetPluginInfo(args: any) {
    const { slug } = args;
    const info = await this.api.getPluginInfo(slug);

    if (!info) {
      throw new McpError(ErrorCode.InvalidRequest, `Plugin not found: ${slug}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(info, null, 2)
        }
      ]
    };
  }

  private async handleDownloadPlugin(args: any) {
    const { slug, version = 'latest' } = args;
    const filePath = await this.api.downloadPlugin(slug, version);

    if (!filePath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${slug}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Plugin downloaded to: ${filePath}`
        }
      ]
    };
  }

  private async handleExtractPlugin(args: any) {
    const { slug, zip_path } = args;
    let zipPath = zip_path;

    if (!zipPath) {
      // Try to find the downloaded ZIP
      zipPath = await this.api.downloadPlugin(slug);
      if (!zipPath) {
        throw new McpError(ErrorCode.InvalidRequest, `Plugin ZIP not found: ${slug}`);
      }
    }

    const extracted = await this.extractor.extractPlugin(zipPath, slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${slug}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Plugin extracted to: ${extracted.extractPath}\nFiles: ${extracted.files.length}`
        }
      ]
    };
  }

  private async handleListPluginFiles(args: any) {
    const { slug, extension } = args;
    const extractPath = path.join(this.extractor.extractDir, slug);
    const extracted = { slug, extractPath, files: [] };

    const files = await this.extractor.getPluginFiles(extracted, extension);

    return {
      content: [
        {
          type: 'text' as const,
          text: files.join('\n')
        }
      ]
    };
  }

  private async handleReadPluginFile(args: any) {
    const { slug, file_path } = args;
    const extractPath = path.join(this.extractor.extractDir, slug);
    const extracted = { slug, extractPath, files: [] };

    const content = await this.extractor.readPluginFile(extracted, file_path);
    if (!content) {
      throw new McpError(ErrorCode.InvalidRequest, `File not found: ${file_path}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: content
        }
      ]
    };
  }

  private async handleComparePlugins(args: any) {
    const { local_path, wp_org_slug, format = 'summary' } = args;

    // Ensure WordPress.org plugin is downloaded and extracted
    const zipPath = await this.api.downloadPlugin(wp_org_slug);
    if (!zipPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${wp_org_slug}`);
    }

    const extracted = await this.extractor.extractPlugin(zipPath, wp_org_slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${wp_org_slug}`);
    }

    const comparison = await this.comparator.comparePlugins(local_path, extracted.extractPath);

    if (format === 'summary') {
      return {
        content: [
          {
            type: 'text' as const,
            text: this.comparator.formatComparisonSummary(comparison)
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(comparison, null, 2)
          }
        ]
      };
    }
  }

  private async handleGetFileDiff(args: any) {
    const { local_path, wp_org_slug, file_path } = args;

    // Ensure WordPress.org plugin is downloaded and extracted
    const zipPath = await this.api.downloadPlugin(wp_org_slug);
    if (!zipPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${wp_org_slug}`);
    }

    const extracted = await this.extractor.extractPlugin(zipPath, wp_org_slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${wp_org_slug}`);
    }

    const comparison = await this.comparator.comparePlugins(local_path, extracted.extractPath);
    const fileComparison = comparison.files.find(f => f.file === file_path);

    if (!fileComparison) {
      throw new McpError(ErrorCode.InvalidRequest, `File not found in comparison: ${file_path}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: fileComparison.diff || `File ${file_path} is ${fileComparison.status}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WordPress.org MCP server running on stdio');
  }
}

const server = new WordPressOrgMCPServer();
server.run().catch(console.error);