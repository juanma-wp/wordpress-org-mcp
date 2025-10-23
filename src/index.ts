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
import { RepositoryExtractor } from './repository-extractor.js';
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
  /** Repository extraction and download utility */
  private repositoryExtractor: RepositoryExtractor;

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
    this.repositoryExtractor = new RepositoryExtractor(
      process.env.WP_MCP_REPO_DIR
    );

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
        },
        {
          name: 'find_repository_url',
          description: 'Find the source code repository URL for a WordPress plugin',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug to find repository for'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'download_from_repository',
          description: 'Download plugin source code from its repository (GitHub, GitLab, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug'
              },
              method: {
                type: 'string',
                enum: ['git', 'http'],
                description: 'Download method (default: "git")',
                default: 'git'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'compare_with_repository',
          description: 'Compare WordPress.org plugin with its original repository, including all code files (PHP, JS, CSS)',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Plugin slug to compare'
              },
              format: {
                type: 'string',
                enum: ['summary', 'detailed', 'code-focused'],
                description: 'Output format - "summary" for overview, "detailed" for full comparison, "code-focused" for PHP/JS/CSS analysis (default: "code-focused")',
                default: 'code-focused'
              }
            },
            required: ['slug']
          }
        },
        {
          name: 'compare_local_with_source',
          description: 'Compare your local plugin with its original repository (if available) or WordPress.org version as fallback',
          inputSchema: {
            type: 'object',
            properties: {
              local_path: {
                type: 'string',
                description: 'Path to your local plugin directory'
              },
              wp_org_slug: {
                type: 'string',
                description: 'WordPress.org plugin slug to use as reference'
              },
              prefer_repo: {
                type: 'boolean',
                description: 'Prefer repository over WordPress.org when both are available (default: true)',
                default: true
              },
              format: {
                type: 'string',
                enum: ['summary', 'detailed', 'code-focused'],
                description: 'Output format (default: "code-focused")',
                default: 'code-focused'
              }
            },
            required: ['local_path', 'wp_org_slug']
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
          case 'find_repository_url':
            return await this.handleFindRepositoryUrl(args);
          case 'download_from_repository':
            return await this.handleDownloadFromRepository(args);
          case 'compare_with_repository':
            return await this.handleCompareWithRepository(args);
          case 'compare_local_with_source':
            return await this.handleCompareLocalWithSource(args);
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
   * Handle find_repository_url tool requests.
   * Finds the source code repository URL for a WordPress plugin.
   * @param args - Tool arguments containing plugin slug
   * @returns MCP response with repository information
   */
  private async handleFindRepositoryUrl(args: any) {
    const { slug } = args;

    // First download and extract the plugin
    const zipPath = await this.api.downloadPlugin(slug);
    if (!zipPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${slug}`);
    }

    const extracted = await this.extractor.extractPlugin(zipPath, slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${slug}`);
    }

    // Find repository URL
    const repoInfo = await this.repositoryExtractor.findRepositoryUrl(extracted);

    if (!repoInfo) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No repository URL found for plugin: ${slug}\n\nThe plugin might not have a public repository, or it may not be referenced in the plugin files.\n\nSearched in:\n- readme.txt/README.md\n- composer.json/package.json\n- Main PHP files\n- Plugin headers\n- Build configuration files\n\nTo improve repository detection, plugin authors should include:\n- "Plugin URI" header pointing to GitHub/GitLab/Bitbucket\n- repository field in composer.json or package.json\n- GitHub/GitLab/Bitbucket links in readme files`
          }
        ]
      };
    }

    let output = `Repository Found!\n`;
    output += `================\n\n`;
    output += `Plugin: ${slug}\n`;
    output += `Repository URL: ${repoInfo.url}\n`;
    output += `Repository Type: ${repoInfo.type}\n`;
    if (repoInfo.owner) {
      output += `Owner: ${repoInfo.owner}\n`;
    }
    if (repoInfo.repo) {
      output += `Repository Name: ${repoInfo.repo}\n`;
    }
    if (repoInfo.branch) {
      output += `Default Branch: ${repoInfo.branch}\n`;
    }
    output += `\nYou can now use 'download_from_repository' or 'compare_local_with_source' to work with this repository.`;

    return {
      content: [
        {
          type: 'text' as const,
          text: output
        }
      ]
    };
  }

  /**
   * Handle download_from_repository tool requests.
   * Downloads plugin source code from its repository.
   * @param args - Tool arguments containing plugin slug and download method
   * @returns MCP response with download information
   */
  private async handleDownloadFromRepository(args: any) {
    const { slug, method = 'git' } = args;

    // First find the repository URL
    const zipPath = await this.api.downloadPlugin(slug);
    if (!zipPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${slug}`);
    }

    const extracted = await this.extractor.extractPlugin(zipPath, slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${slug}`);
    }

    const repoInfo = await this.repositoryExtractor.findRepositoryUrl(extracted);
    if (!repoInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `No repository found for plugin: ${slug}`);
    }

    // Download from repository
    let repoDownload;
    try {
      if (method === 'http') {
        repoDownload = await this.repositoryExtractor.downloadRepositoryViaHttp(repoInfo, slug);
      } else {
        repoDownload = await this.repositoryExtractor.downloadRepository(repoInfo, slug);
      }
    } catch (error: any) {
      // Try HTTP method as fallback
      if (method === 'git') {
        try {
          repoDownload = await this.repositoryExtractor.downloadRepositoryViaHttp(repoInfo, slug);
        } catch {
          throw new McpError(ErrorCode.InternalError, `Failed to download repository: ${error.message}`);
        }
      } else {
        throw new McpError(ErrorCode.InternalError, `Failed to download repository: ${error.message}`);
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Repository downloaded successfully!\n\nRepository: ${repoInfo.url}\nType: ${repoInfo.type}\nPath: ${repoDownload.path}\nFiles: ${repoDownload.files.length}\n\nBranch: ${repoInfo.branch || 'default'}`
        }
      ]
    };
  }

  /**
   * Handle compare_with_repository tool requests.
   * Compares WordPress.org plugin with its original repository.
   * @param args - Tool arguments containing plugin slug and format
   * @returns MCP response with comparison results
   */
  private async handleCompareWithRepository(args: any) {
    const { slug, format = 'code-focused' } = args;

    // Download and extract WordPress.org version
    const zipPath = await this.api.downloadPlugin(slug);
    if (!zipPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${slug}`);
    }

    const extracted = await this.extractor.extractPlugin(zipPath, slug);
    if (!extracted) {
      throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${slug}`);
    }

    // Find and download repository
    const repoInfo = await this.repositoryExtractor.findRepositoryUrl(extracted);
    if (!repoInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `No repository found for plugin: ${slug}`);
    }

    let repoDownload;
    try {
      repoDownload = await this.repositoryExtractor.downloadRepository(repoInfo, slug);
    } catch {
      // Try HTTP method as fallback
      try {
        repoDownload = await this.repositoryExtractor.downloadRepositoryViaHttp(repoInfo, slug);
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `Failed to download repository: ${error.message}`);
      }
    }

    // Compare WordPress.org version with repository
    const wpOrgComparison = await this.comparator.comparePlugins(extracted.extractPath, repoDownload.path);

    // Categorize files by type
    const codeFiles = {
      php: { wpOnly: [] as string[], repoOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      js: { wpOnly: [] as string[], repoOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      css: { wpOnly: [] as string[], repoOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      other: { wpOnly: [] as string[], repoOnly: [] as string[], different: [] as string[], identical: [] as string[] }
    };

    // Categorize all files
    for (const file of wpOrgComparison.files) {
      let category: keyof typeof codeFiles;
      if (file.file.endsWith('.php')) {
        category = 'php';
      } else if (file.file.endsWith('.js') || file.file.endsWith('.jsx') || file.file.endsWith('.ts') || file.file.endsWith('.tsx')) {
        category = 'js';
      } else if (file.file.endsWith('.css') || file.file.endsWith('.scss') || file.file.endsWith('.sass') || file.file.endsWith('.less')) {
        category = 'css';
      } else {
        category = 'other';
      }

      if (file.status === 'local_only') {
        codeFiles[category].wpOnly.push(file.file);
      } else if (file.status === 'remote_only') {
        codeFiles[category].repoOnly.push(file.file);
      } else if (file.status === 'different') {
        codeFiles[category].different.push(file.file);
      } else if (file.status === 'identical') {
        codeFiles[category].identical.push(file.file);
      }
    }

    // Build response based on format
    let output = `Comparison: WordPress.org vs Repository\n`;
    output += `========================================\n\n`;
    output += `Plugin: ${slug}\n`;
    output += `Repository: ${repoInfo.url}\n`;
    output += `Repository Type: ${repoInfo.type}\n\n`;

    if (format === 'summary') {
      output += `Overall Summary:\n`;
      output += `----------------\n`;
      output += `- Identical files: ${wpOrgComparison.summary.identical}\n`;
      output += `- Different files: ${wpOrgComparison.summary.different}\n`;
      output += `- WordPress.org only: ${wpOrgComparison.summary.localOnly}\n`;
      output += `- Repository only: ${wpOrgComparison.summary.remoteOnly}\n`;
      output += `- Total files: ${wpOrgComparison.summary.total}\n`;

    } else if (format === 'code-focused' || format === 'detailed') {
      // PHP Files Analysis
      output += `PHP Files Analysis:\n`;
      output += `------------------\n`;
      output += `- Identical: ${codeFiles.php.identical.length} files\n`;
      output += `- Modified: ${codeFiles.php.different.length} files\n`;
      output += `- WordPress.org only: ${codeFiles.php.wpOnly.length} files\n`;
      output += `- Repository only: ${codeFiles.php.repoOnly.length} files\n\n`;

      if (codeFiles.php.different.length > 0 && (format === 'detailed' || codeFiles.php.different.length <= 10)) {
        output += `Modified PHP files:\n`;
        codeFiles.php.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.php.wpOnly.length > 0 && (format === 'detailed' || codeFiles.php.wpOnly.length <= 10)) {
        output += `PHP files only in WordPress.org:\n`;
        codeFiles.php.wpOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.php.repoOnly.length > 0 && (format === 'detailed' || codeFiles.php.repoOnly.length <= 10)) {
        output += `PHP files only in Repository:\n`;
        codeFiles.php.repoOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // JavaScript Files Analysis
      output += `JavaScript Files Analysis:\n`;
      output += `-------------------------\n`;
      output += `- Identical: ${codeFiles.js.identical.length} files\n`;
      output += `- Modified: ${codeFiles.js.different.length} files\n`;
      output += `- WordPress.org only: ${codeFiles.js.wpOnly.length} files\n`;
      output += `- Repository only: ${codeFiles.js.repoOnly.length} files\n\n`;

      // Check for minified files
      const minifiedJs = codeFiles.js.wpOnly.filter(f => f.includes('.min.js') || f.includes('-min.js'));
      if (minifiedJs.length > 0) {
        output += `  ⚠️  ${minifiedJs.length} minified JS files found only in WordPress.org version\n\n`;
      }

      if (codeFiles.js.different.length > 0 && (format === 'detailed' || codeFiles.js.different.length <= 10)) {
        output += `Modified JS files:\n`;
        codeFiles.js.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.js.wpOnly.length > 0 && (format === 'detailed' || codeFiles.js.wpOnly.length <= 10)) {
        output += `JS files only in WordPress.org:\n`;
        codeFiles.js.wpOnly.forEach(f => {
          const isMinified = f.includes('.min.') || f.includes('-min.');
          output += `  • ${f}${isMinified ? ' (minified)' : ''}\n`;
        });
        output += `\n`;
      }

      if (codeFiles.js.repoOnly.length > 0 && (format === 'detailed' || codeFiles.js.repoOnly.length <= 10)) {
        output += `JS files only in Repository:\n`;
        codeFiles.js.repoOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // CSS Files Analysis
      output += `CSS Files Analysis:\n`;
      output += `------------------\n`;
      output += `- Identical: ${codeFiles.css.identical.length} files\n`;
      output += `- Modified: ${codeFiles.css.different.length} files\n`;
      output += `- WordPress.org only: ${codeFiles.css.wpOnly.length} files\n`;
      output += `- Repository only: ${codeFiles.css.repoOnly.length} files\n\n`;

      // Check for minified CSS
      const minifiedCss = codeFiles.css.wpOnly.filter(f => f.includes('.min.css') || f.includes('-min.css'));
      if (minifiedCss.length > 0) {
        output += `  ⚠️  ${minifiedCss.length} minified CSS files found only in WordPress.org version\n\n`;
      }

      if (codeFiles.css.different.length > 0 && (format === 'detailed' || codeFiles.css.different.length <= 10)) {
        output += `Modified CSS files:\n`;
        codeFiles.css.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.css.wpOnly.length > 0 && (format === 'detailed' || codeFiles.css.wpOnly.length <= 10)) {
        output += `CSS files only in WordPress.org:\n`;
        codeFiles.css.wpOnly.forEach(f => {
          const isMinified = f.includes('.min.') || f.includes('-min.');
          output += `  • ${f}${isMinified ? ' (minified)' : ''}\n`;
        });
        output += `\n`;
      }

      if (codeFiles.css.repoOnly.length > 0 && (format === 'detailed' || codeFiles.css.repoOnly.length <= 10)) {
        output += `CSS files only in Repository:\n`;
        codeFiles.css.repoOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // Summary insights
      output += `Key Insights:\n`;
      output += `-------------\n`;

      const totalCodeFiles = codeFiles.php.identical.length + codeFiles.php.different.length +
                            codeFiles.php.wpOnly.length + codeFiles.php.repoOnly.length +
                            codeFiles.js.identical.length + codeFiles.js.different.length +
                            codeFiles.js.wpOnly.length + codeFiles.js.repoOnly.length +
                            codeFiles.css.identical.length + codeFiles.css.different.length +
                            codeFiles.css.wpOnly.length + codeFiles.css.repoOnly.length;

      const identicalCodeFiles = codeFiles.php.identical.length + codeFiles.js.identical.length + codeFiles.css.identical.length;
      const modifiedCodeFiles = codeFiles.php.different.length + codeFiles.js.different.length + codeFiles.css.different.length;

      output += `• Total code files analyzed: ${totalCodeFiles}\n`;
      output += `• Code files identical: ${identicalCodeFiles} (${Math.round(identicalCodeFiles / totalCodeFiles * 100)}%)\n`;
      output += `• Code files modified: ${modifiedCodeFiles} (${Math.round(modifiedCodeFiles / totalCodeFiles * 100)}%)\n`;

      if (minifiedJs.length + minifiedCss.length > 0) {
        output += `• Minified assets in WordPress.org: ${minifiedJs.length + minifiedCss.length} files\n`;
      }

      // Check for build artifacts
      const buildArtifacts = wpOrgComparison.files.filter(f =>
        f.status === 'local_only' &&
        (f.file.includes('/dist/') || f.file.includes('/build/') || f.file.includes('/vendor/'))
      );

      if (buildArtifacts.length > 0) {
        output += `• Build artifacts in WordPress.org: ${buildArtifacts.length} files\n`;
      }

      // Check for development files in repo
      const devFiles = wpOrgComparison.files.filter(f =>
        f.status === 'remote_only' &&
        (f.file.includes('test') || f.file.includes('spec') || f.file.endsWith('.md') ||
         f.file === '.gitignore' || f.file === '.eslintrc' || f.file === 'package.json' ||
         f.file === 'composer.json' || f.file === 'webpack.config.js')
      );

      if (devFiles.length > 0) {
        output += `• Development files in repository: ${devFiles.length} files\n`;
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: output
        }
      ]
    };
  }

  /**
   * Handle compare_local_with_source tool requests.
   * Compares local plugin with original repository (preferred) or WordPress.org as fallback.
   * @param args - Tool arguments containing local_path, wp_org_slug, prefer_repo, and format
   * @returns MCP response with comparison results
   */
  private async handleCompareLocalWithSource(args: any) {
    const { local_path, wp_org_slug, prefer_repo = true, format = 'code-focused' } = args;

    // First, try to find the repository if prefer_repo is true
    let sourcePath: string;
    let sourceType: 'repository' | 'wordpress.org';
    let repoInfo: any = null;

    if (prefer_repo) {
      try {
        // Download WordPress.org version to extract repository info
        const zipPath = await this.api.downloadPlugin(wp_org_slug);
        if (zipPath) {
          const extracted = await this.extractor.extractPlugin(zipPath, wp_org_slug);
          if (extracted) {
            repoInfo = await this.repositoryExtractor.findRepositoryUrl(extracted);

            if (repoInfo) {
              // Try to download from repository
              try {
                const repoDownload = await this.repositoryExtractor.downloadRepository(repoInfo, wp_org_slug);
                sourcePath = repoDownload.path;
                sourceType = 'repository';
              } catch {
                // Try HTTP download as fallback
                try {
                  const repoDownload = await this.repositoryExtractor.downloadRepositoryViaHttp(repoInfo, wp_org_slug);
                  sourcePath = repoDownload.path;
                  sourceType = 'repository';
                } catch {
                  // Repository download failed, fall back to WordPress.org
                  sourcePath = extracted.extractPath;
                  sourceType = 'wordpress.org';
                  repoInfo = null;
                }
              }
            } else {
              // No repository found, use WordPress.org version
              sourcePath = extracted.extractPath;
              sourceType = 'wordpress.org';
            }
          } else {
            throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${wp_org_slug}`);
          }
        } else {
          throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${wp_org_slug}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        // Fall back to WordPress.org only
        const zipPath = await this.api.downloadPlugin(wp_org_slug);
        if (!zipPath) {
          throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${wp_org_slug}`);
        }
        const extracted = await this.extractor.extractPlugin(zipPath, wp_org_slug);
        if (!extracted) {
          throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${wp_org_slug}`);
        }
        sourcePath = extracted.extractPath;
        sourceType = 'wordpress.org';
      }
    } else {
      // User explicitly wants WordPress.org version
      const zipPath = await this.api.downloadPlugin(wp_org_slug);
      if (!zipPath) {
        throw new McpError(ErrorCode.InvalidRequest, `Failed to download plugin: ${wp_org_slug}`);
      }
      const extracted = await this.extractor.extractPlugin(zipPath, wp_org_slug);
      if (!extracted) {
        throw new McpError(ErrorCode.InternalError, `Failed to extract plugin: ${wp_org_slug}`);
      }
      sourcePath = extracted.extractPath;
      sourceType = 'wordpress.org';
    }

    // Now compare local plugin with the source
    const comparison = await this.comparator.comparePlugins(local_path, sourcePath);

    // Categorize files by type for code-focused analysis
    const codeFiles = {
      php: { localOnly: [] as string[], sourceOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      js: { localOnly: [] as string[], sourceOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      css: { localOnly: [] as string[], sourceOnly: [] as string[], different: [] as string[], identical: [] as string[] },
      other: { localOnly: [] as string[], sourceOnly: [] as string[], different: [] as string[], identical: [] as string[] }
    };

    // Categorize all files
    for (const file of comparison.files) {
      let category: keyof typeof codeFiles;
      if (file.file.endsWith('.php')) {
        category = 'php';
      } else if (file.file.endsWith('.js') || file.file.endsWith('.jsx') || file.file.endsWith('.ts') || file.file.endsWith('.tsx')) {
        category = 'js';
      } else if (file.file.endsWith('.css') || file.file.endsWith('.scss') || file.file.endsWith('.sass') || file.file.endsWith('.less')) {
        category = 'css';
      } else {
        category = 'other';
      }

      if (file.status === 'local_only') {
        codeFiles[category].localOnly.push(file.file);
      } else if (file.status === 'remote_only') {
        codeFiles[category].sourceOnly.push(file.file);
      } else if (file.status === 'different') {
        codeFiles[category].different.push(file.file);
      } else if (file.status === 'identical') {
        codeFiles[category].identical.push(file.file);
      }
    }

    // Build response
    let output = `Comparison: Local Plugin vs ${sourceType === 'repository' ? 'Original Repository' : 'WordPress.org'}\n`;
    output += `${'='.repeat(60)}\n\n`;
    output += `Local Plugin: ${local_path}\n`;
    output += `Reference: ${wp_org_slug} (${sourceType})\n`;
    if (repoInfo) {
      output += `Repository: ${repoInfo.url}\n`;
      output += `Repository Type: ${repoInfo.type}\n`;
      if (repoInfo.branch) {
        output += `Branch: ${repoInfo.branch}\n`;
      }
      output += `\n✅ Using original repository source code for comparison\n`;
    } else if (sourceType === 'wordpress.org') {
      output += `\n⚠️ No repository found - using WordPress.org deployed version\n`;
      output += `Note: This may include minified/built files not in the original source\n`;
    }
    output += `\n`;

    if (format === 'summary') {
      output += `Overall Summary:\n`;
      output += `----------------\n`;
      output += `- Identical files: ${comparison.summary.identical}\n`;
      output += `- Different files: ${comparison.summary.different}\n`;
      output += `- Local only: ${comparison.summary.localOnly}\n`;
      output += `- ${sourceType === 'repository' ? 'Repository' : 'WordPress.org'} only: ${comparison.summary.remoteOnly}\n`;
      output += `- Total files: ${comparison.summary.total}\n`;

    } else if (format === 'code-focused' || format === 'detailed') {
      // PHP Files Analysis
      output += `PHP Files Analysis:\n`;
      output += `------------------\n`;
      output += `- Identical: ${codeFiles.php.identical.length} files\n`;
      output += `- Modified: ${codeFiles.php.different.length} files\n`;
      output += `- Local only: ${codeFiles.php.localOnly.length} files\n`;
      output += `- ${sourceType === 'repository' ? 'Repository' : 'WordPress.org'} only: ${codeFiles.php.sourceOnly.length} files\n\n`;

      if (codeFiles.php.different.length > 0 && (format === 'detailed' || codeFiles.php.different.length <= 10)) {
        output += `Modified PHP files:\n`;
        codeFiles.php.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.php.localOnly.length > 0 && (format === 'detailed' || codeFiles.php.localOnly.length <= 10)) {
        output += `PHP files only in your local plugin:\n`;
        codeFiles.php.localOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.php.sourceOnly.length > 0 && (format === 'detailed' || codeFiles.php.sourceOnly.length <= 10)) {
        output += `PHP files only in ${sourceType === 'repository' ? 'repository' : 'WordPress.org'}:\n`;
        codeFiles.php.sourceOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // JavaScript Files Analysis
      output += `JavaScript Files Analysis:\n`;
      output += `-------------------------\n`;
      output += `- Identical: ${codeFiles.js.identical.length} files\n`;
      output += `- Modified: ${codeFiles.js.different.length} files\n`;
      output += `- Local only: ${codeFiles.js.localOnly.length} files\n`;
      output += `- ${sourceType === 'repository' ? 'Repository' : 'WordPress.org'} only: ${codeFiles.js.sourceOnly.length} files\n\n`;

      if (codeFiles.js.different.length > 0 && (format === 'detailed' || codeFiles.js.different.length <= 10)) {
        output += `Modified JS files:\n`;
        codeFiles.js.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.js.localOnly.length > 0 && (format === 'detailed' || codeFiles.js.localOnly.length <= 10)) {
        output += `JS files only in your local plugin:\n`;
        codeFiles.js.localOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.js.sourceOnly.length > 0 && (format === 'detailed' || codeFiles.js.sourceOnly.length <= 10)) {
        output += `JS files only in ${sourceType === 'repository' ? 'repository' : 'WordPress.org'}:\n`;
        codeFiles.js.sourceOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // CSS Files Analysis
      output += `CSS Files Analysis:\n`;
      output += `------------------\n`;
      output += `- Identical: ${codeFiles.css.identical.length} files\n`;
      output += `- Modified: ${codeFiles.css.different.length} files\n`;
      output += `- Local only: ${codeFiles.css.localOnly.length} files\n`;
      output += `- ${sourceType === 'repository' ? 'Repository' : 'WordPress.org'} only: ${codeFiles.css.sourceOnly.length} files\n\n`;

      if (codeFiles.css.different.length > 0 && (format === 'detailed' || codeFiles.css.different.length <= 10)) {
        output += `Modified CSS files:\n`;
        codeFiles.css.different.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.css.localOnly.length > 0 && (format === 'detailed' || codeFiles.css.localOnly.length <= 10)) {
        output += `CSS files only in your local plugin:\n`;
        codeFiles.css.localOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      if (codeFiles.css.sourceOnly.length > 0 && (format === 'detailed' || codeFiles.css.sourceOnly.length <= 10)) {
        output += `CSS files only in ${sourceType === 'repository' ? 'repository' : 'WordPress.org'}:\n`;
        codeFiles.css.sourceOnly.forEach(f => output += `  • ${f}\n`);
        output += `\n`;
      }

      // Summary insights
      output += `Key Insights:\n`;
      output += `-------------\n`;

      const totalCodeFiles = codeFiles.php.identical.length + codeFiles.php.different.length +
                            codeFiles.php.localOnly.length + codeFiles.php.sourceOnly.length +
                            codeFiles.js.identical.length + codeFiles.js.different.length +
                            codeFiles.js.localOnly.length + codeFiles.js.sourceOnly.length +
                            codeFiles.css.identical.length + codeFiles.css.different.length +
                            codeFiles.css.localOnly.length + codeFiles.css.sourceOnly.length;

      const identicalCodeFiles = codeFiles.php.identical.length + codeFiles.js.identical.length + codeFiles.css.identical.length;
      const modifiedCodeFiles = codeFiles.php.different.length + codeFiles.js.different.length + codeFiles.css.different.length;

      output += `• Total code files analyzed: ${totalCodeFiles}\n`;
      if (totalCodeFiles > 0) {
        output += `• Code files identical: ${identicalCodeFiles} (${Math.round(identicalCodeFiles / totalCodeFiles * 100)}%)\n`;
        output += `• Code files modified: ${modifiedCodeFiles} (${Math.round(modifiedCodeFiles / totalCodeFiles * 100)}%)\n`;
      }

      if (sourceType === 'repository') {
        output += `• Using original repository as source of truth\n`;

        // Check for features added in local version
        const newFeatures = codeFiles.php.localOnly.length + codeFiles.js.localOnly.length + codeFiles.css.localOnly.length;
        if (newFeatures > 0) {
          output += `• New features in your plugin: ${newFeatures} code files added\n`;
        }

        // Check for missing features
        const missingFeatures = codeFiles.php.sourceOnly.length + codeFiles.js.sourceOnly.length + codeFiles.css.sourceOnly.length;
        if (missingFeatures > 0) {
          output += `• Features from original not in your plugin: ${missingFeatures} code files\n`;
        }
      } else {
        output += `• Using WordPress.org version (no repository found)\n`;
        output += `• Note: This may include minified/built files not in the original source\n`;
      }

      // Provide recommendation
      output += `\nRecommendation:\n`;
      output += `---------------\n`;
      if (modifiedCodeFiles > 0) {
        output += `Your plugin has ${modifiedCodeFiles} modified code files compared to the ${sourceType === 'repository' ? 'original repository' : 'WordPress.org version'}.\n`;
        output += `Use 'get_file_diff' to examine specific file differences.\n`;
      } else if (identicalCodeFiles === totalCodeFiles && totalCodeFiles > 0) {
        output += `Your plugin code is identical to the ${sourceType === 'repository' ? 'original repository' : 'WordPress.org version'}.\n`;
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: output
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