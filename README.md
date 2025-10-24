# WordPress Plugin Directory MCP Server

[![Tests](https://github.com/juanma-wp/wordpress-org-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/juanma-wp/wordpress-org-mcp/actions/workflows/test.yml)

[![npm version](https://badge.fury.io/js/wordpress-org-mcp-server.svg)](https://badge.fury.io/js/wordpress-org-mcp-server) [![npm downloads](https://img.shields.io/npm/dm/wordpress-org-mcp-server.svg)](https://www.npmjs.com/package/wordpress-org-mcp-server)

A Model Context Protocol (MCP) server that enables Claude Code to analyze, download, and compare [WordPress.org plugins](https://wordpress.org/plugins/) with your local plugins.

**🔗 Repository:** [https://github.com/juanma-wp/wordpress-org-mcp](https://github.com/juanma-wp/wordpress-org-mcp)

## Features

- **Search plugins** on WordPress.org by keyword
- **Download plugins** directly from WordPress.org
- **Extract and analyze** plugin files
- **Compare local plugins** with WordPress.org versions
- **Generate detailed diffs** between plugin versions
- **Browse plugin file structures**
- **Find repository URLs** - Automatically detect source code repository URLs from plugins
- **Download from repositories** - Clone plugin source code from GitHub, GitLab, Bitbucket, or SVN
- **Compare with original source** - Compare WordPress.org versions with repository code, analyzing all code files (PHP, JS, CSS)

## Installation & Setup

```bash
# Register with Claude CLI
claude mcp add wordpress-org npx wordpress-org-mcp-server

# Verify registration
claude mcp list
```

## Available Tools

### `search_plugins`
Search for WordPress.org plugins by keyword.

**Parameters:**
- `query` (string): Search query
- `limit` (number, optional): Maximum results (default: 10)

**Example:**
```
Search for "jwt authentication" plugins
```

### `get_plugin_info`
Get detailed information about a specific plugin.

**Parameters:**
- `slug` (string): Plugin slug

**Example:**
```
Get info for plugin "jwt-authentication-for-wp-rest-api"
```

### `download_plugin`
Download a plugin from WordPress.org.

**Parameters:**
- `slug` (string): Plugin slug
- `version` (string, optional): Version (default: "latest")

### `extract_plugin`
Extract a downloaded plugin ZIP file.

**Parameters:**
- `slug` (string): Plugin slug
- `zip_path` (string, optional): Path to ZIP file

### `list_plugin_files`
List files in an extracted plugin.

**Parameters:**
- `slug` (string): Plugin slug
- `extension` (string, optional): Filter by extension (.php, .js, etc.)

### `read_plugin_file`
Read contents of a specific plugin file.

**Parameters:**
- `slug` (string): Plugin slug
- `file_path` (string): Relative path to file

### `compare_plugins`
Compare local plugin with WordPress.org version.

**Parameters:**
- `local_path` (string): Path to local plugin directory
- `wp_org_slug` (string): WordPress.org plugin slug
- `format` (string, optional): "summary" or "detailed" (default: "summary")

**Example:**
```
Compare my local plugin with WordPress.org version:
- local_path: "/absolute/path/to/rest-auth-jwt"
- wp_org_slug: "jwt-authentication-for-wp-rest-api"
```

### `get_file_diff`
Get detailed diff for a specific file.

**Parameters:**
- `local_path` (string): Path to local plugin
- `wp_org_slug` (string): WordPress.org plugin slug
- `file_path` (string): Relative path to file

### `find_repository_url`
Find the source code repository URL for a WordPress plugin.

**Parameters:**
- `slug` (string): Plugin slug

**Example:**
```
Find the GitHub repository for "woocommerce"
```

### `download_from_repository`
Download plugin source code from its repository (GitHub, GitLab, Bitbucket, or SVN).

**Parameters:**
- `slug` (string): Plugin slug
- `method` (string, optional): Download method - "git" or "http" (default: "git")

**Example:**
```
Download the original source code for "woocommerce" from its repository
```

### `compare_with_repository`
Compare WordPress.org plugin with its original repository, analyzing all code files (PHP, JS, CSS).

**Parameters:**
- `slug` (string): Plugin slug
- `format` (string, optional): Output format - "summary", "detailed", or "code-focused" (default: "code-focused")
  - `summary`: High-level overview of file differences
  - `code-focused`: Detailed analysis of PHP, JS, and CSS files with key insights
  - `detailed`: Complete listing of all file differences

**Example:**
```
Compare the WordPress.org version of "woocommerce" with its GitHub repository to see all code differences
```

### `compare_local_with_source`
**🎯 PRIMARY COMPARISON TOOL** - Compare your local plugin with the original source (repository preferred, WordPress.org as fallback).

**Parameters:**
- `local_path` (string): Path to your local plugin directory
- `wp_org_slug` (string): WordPress.org plugin slug to use as reference
- `prefer_repo` (boolean, optional): Prefer repository over WordPress.org when available (default: true)
- `format` (string, optional): Output format - "summary", "detailed", or "code-focused" (default: "code-focused")

**Example:**
```
Compare my local plugin at "/path/to/my-jwt-auth" with the original "jwt-authentication-for-wp-rest-api" source code
```

This tool automatically:
1. Searches for the plugin's original repository (GitHub, GitLab, etc.)
2. Uses the repository as the source of truth if found
3. Falls back to WordPress.org version if no repository exists
4. Provides detailed code comparison focused on PHP, JS, and CSS files

## Example Workflows

### Primary Workflow: Compare Your Plugin with Original Source

1. **Compare your local plugin with the original source code:**
   ```
   Use compare_local_with_source to compare "/path/to/my/jwt-plugin" with "jwt-authentication-for-wp-rest-api"
   ```
   This automatically finds and uses the original repository if available, or falls back to WordPress.org.

2. **Examine specific file differences:**
   ```
   Show me the diff for "includes/class-auth.php" between my plugin and the source
   ```

3. **Get detailed analysis:**
   ```
   Use "detailed" format to see all file differences
   ```

### Alternative Workflows

#### Comparing with WordPress.org Only

1. **Force comparison with WordPress.org version:**
   ```
   Use compare_local_with_source with prefer_repo=false to compare with WordPress.org version only
   ```

#### Analyzing Repository vs WordPress.org

1. **Find the plugin's repository:**
   ```
   Find the repository URL for "woocommerce"
   ```

2. **Download from repository:**
   ```
   Download the source code for "woocommerce" from its GitHub repository
   ```

3. **Compare WordPress.org vs Repository:**
   ```
   Compare the WordPress.org version of "woocommerce" with its repository to analyze all code differences
   ```

This comprehensive comparison helps identify:
- **PHP code modifications** between repository and WordPress.org distribution
- **JavaScript changes** including minified files and build artifacts
- **CSS differences** between development and production versions
- **Build artifacts** added for WordPress.org distribution
- **Development files** present only in the repository (tests, configs, etc.)
- **Distribution optimizations** applied when publishing to WordPress.org

## Plugin Storage Locations

The server stores downloaded and extracted plugins in system directories to avoid cluttering your project workspace:

### Default Locations

**macOS:**
- **Cache** (downloads): `~/Library/Caches/wordpress-org-mcp/`
- **Extractions**: `/tmp/wordpress-org-mcp-extractions/`
- **Repositories**: `/tmp/wordpress-org-mcp-extractions/repositories/`

**Linux:**
- **Cache** (downloads): `~/.cache/wordpress-org-mcp/` (or `$XDG_CACHE_HOME/wordpress-org-mcp/`)
- **Extractions**: `/tmp/wordpress-org-mcp-extractions/`
- **Repositories**: `/tmp/wordpress-org-mcp-extractions/repositories/`

**Windows:**
- **Cache** (downloads): `%LOCALAPPDATA%\wordpress-org-mcp\Cache\`
- **Extractions**: `%TEMP%\wordpress-org-mcp-extractions\`
- **Repositories**: `%TEMP%\wordpress-org-mcp-extractions\repositories\`

### Customizing Storage Locations

Set these environment variables before registering the MCP server:

```bash
# Set custom paths
export WP_MCP_CACHE_DIR="/path/to/custom/cache"
export WP_MCP_EXTRACT_DIR="/path/to/custom/extractions"
export WP_MCP_REPO_DIR="/path/to/custom/repositories"

# Register the MCP server (will use custom paths)
claude mcp add wordpress-org npx wordpress-org-mcp-server

**Persistent Setup:**
Add the environment variables to your shell profile (`.bashrc`, `.zshrc`, `.bash_profile`, etc.):

```bash
echo 'export WP_MCP_CACHE_DIR="/path/to/custom/cache"' >> ~/.zshrc
echo 'export WP_MCP_EXTRACT_DIR="/path/to/custom/extractions"' >> ~/.zshrc
source ~/.zshrc
```

**Environment Variables:**
- `WP_MCP_CACHE_DIR`: Custom directory for downloaded ZIP files
- `WP_MCP_EXTRACT_DIR`: Custom directory for extracted plugin files
- `WP_MCP_REPO_DIR`: Custom directory for cloned repositories

### Why System Directories?

- **No Git conflicts**: Downloaded plugins won't appear in your project's version control
- **Cross-platform compatibility**: Uses appropriate directories for each operating system
- **Easy cleanup**: Temporary extractions are automatically cleaned up on system restart

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Start the server
npm start
```

## Troubleshooting

1. **"Plugin not found" errors**: Verify the plugin slug is correct on WordPress.org
2. **Download failures**: Check internet connection and WordPress.org availability
3. **Extraction errors**: Ensure sufficient disk space and file permissions

## Supported File Types

- PHP files (.php)
- JavaScript files (.js)
- CSS files (.css)
- Text files (.txt, .md)
- Configuration files (.json, .xml, .yml)

Binary files are compared by size only.