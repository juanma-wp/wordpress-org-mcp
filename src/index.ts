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

/**
 * WordPress.org MCP (Model Context Protocol) Server
 *
 * Provides tools for searching, downloading, extracting, and comparing WordPress plugins
 * from the WordPress.org repository. The server exposes various tools through the MCP protocol
 * to enable plugin analysis, comparison with local versions, and file-level diff operations.
 *
 * Main capabilities:
 * - Search for plugins on WordPress.org
 * - Download plugin ZIP files
 * - Extract and analyze plugin contents
 * - Compare local plugins with WordPress.org versions
 * - Generate file-level diffs
 */
export class WordPressOrgMCPServer {
  /** The MCP server instance for handling protocol communication */
  protected server: Server;
  /** WordPress.org API client for plugin operations */
  private api: WordPressOrgAPI;
  /** Plugin extraction utility for handling ZIP files */
  private extractor: PluginExtractor;
  /** Plugin comparison utility for generating diffs */
  private comparator: PluginComparator;

  /**
   * Initialize the WordPress.org MCP server with all required components.
   * Sets up the MCP server, API client, extractor, and comparator with optional custom directories.
   */
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

  /**
   * Set up all MCP tool handlers and their schemas.
   * Registers handlers for listing available tools and executing tool calls.
   * Each tool is defined with its input schema and mapped to its implementation method.
   */
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

  /**
   * Handle search_plugins tool requests.
   * @param args - Tool arguments containing query string and optional limit
   * @returns MCP response with JSON array of matching plugins
   */
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

  /**
   * Handle get_plugin_info tool requests.
   * @param args - Tool arguments containing plugin slug
   * @returns MCP response with detailed plugin information
   * @throws McpError if plugin is not found
   */
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

  /**
   * Handle download_plugin tool requests.
   * @param args - Tool arguments containing plugin slug and optional version
   * @returns MCP response with the path where plugin was downloaded
   * @throws McpError if download fails
   */
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

  /**
   * Handle extract_plugin tool requests.
   * @param args - Tool arguments containing plugin slug and optional zip_path
   * @returns MCP response with extraction path and file count
   * @throws McpError if extraction fails or ZIP file not found
   */
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

  /**
   * Handle list_plugin_files tool requests.
   * @param args - Tool arguments containing plugin slug and optional file extension filter
   * @returns MCP response with newline-separated list of plugin files
   */
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

  /**
   * Handle read_plugin_file tool requests.
   * @param args - Tool arguments containing plugin slug and file path
   * @returns MCP response with file contents
   * @throws McpError if file is not found
   */
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

  /**
   * Handle compare_plugins tool requests.
   * Compares a local plugin directory with a WordPress.org plugin version.
   * @param args - Tool arguments containing local_path, wp_org_slug, and optional format
   * @returns MCP response with comparison results (summary or detailed JSON)
   * @throws McpError if download or extraction fails
   */
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

  /**
   * Handle get_file_diff tool requests.
   * Gets a detailed diff for a specific file between local and WordPress.org versions.
   * @param args - Tool arguments containing local_path, wp_org_slug, and file_path
   * @returns MCP response with file diff or status message
   * @throws McpError if download, extraction, or file comparison fails
   */
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

  /**
   * Start the MCP server and listen for incoming requests on stdio.
   * This method establishes the stdio transport connection and begins processing MCP requests.
   * @throws Error if server fails to start
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WordPress.org MCP server running on stdio');
  }
}

const server = new WordPressOrgMCPServer();
server.run().catch(console.error);