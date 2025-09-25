# WordPress.org MCP Server

A Model Context Protocol (MCP) server that enables Claude Code to analyze, download, and compare WordPress.org plugins with your local plugins.

## Features

- **Search plugins** on WordPress.org by keyword
- **Download plugins** directly from WordPress.org
- **Extract and analyze** plugin files
- **Compare local plugins** with WordPress.org versions
- **Generate detailed diffs** between plugin versions
- **Browse plugin file structures**

## Installation & Setup

```bash
# Install globally
npm install -g wordpress-org-mcp-server

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

## Example Workflow

1. **Search for similar plugins:**
   ```
   Search for JWT authentication plugins to see what's available
   ```

2. **Get plugin details:**
   ```
   Get detailed info for "jwt-authentication-for-wp-rest-api"
   ```

3. **Compare with your local plugin:**
   ```
   Compare my local plugin at "/path/to/my/plugin" with "jwt-authentication-for-wp-rest-api"
   ```

4. **Examine specific differences:**
   ```
   Show me the diff for "includes/class-auth.php" between my plugin and "jwt-authentication-for-wp-rest-api"
   ```

## Plugin Storage Locations

The server stores downloaded and extracted plugins in system directories to avoid cluttering your project workspace:

### Default Locations

**macOS:**
- **Cache** (downloads): `~/Library/Caches/wordpress-org-mcp/`
- **Extractions**: `/tmp/wordpress-org-mcp-extractions/`

**Linux:**
- **Cache** (downloads): `~/.cache/wordpress-org-mcp/` (or `$XDG_CACHE_HOME/wordpress-org-mcp/`)
- **Extractions**: `/tmp/wordpress-org-mcp-extractions/`

**Windows:**
- **Cache** (downloads): `%LOCALAPPDATA%\wordpress-org-mcp\Cache\`
- **Extractions**: `%TEMP%\wordpress-org-mcp-extractions\`

### Customizing Storage Locations

Set these environment variables before registering the MCP server:

```bash
# Set custom paths
export WP_MCP_CACHE_DIR="/path/to/custom/cache"
export WP_MCP_EXTRACT_DIR="/path/to/custom/extractions"

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