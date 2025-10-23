# Testing Your Local MCP Server in Claude Desktop

This guide explains how to test your MCP (Model Context Protocol) server locally in Claude Desktop during development, before publishing it to npm.

## Prerequisites

- Claude Desktop app installed
- Node.js and npm installed
- Your MCP server project set up locally

## Step 1: Build Your MCP Server

First, build your TypeScript project to generate the JavaScript files:

```bash
npm run build
```

This creates the compiled files in the `dist/` directory.

## Step 2: Configure Claude Desktop

Claude Desktop looks for MCP servers in its configuration file. The location varies by platform:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Create or Edit the Configuration

1. Open the configuration file (create it if it doesn't exist)
2. Add your local MCP server configuration:

```json
{
  "mcpServers": {
    "wordpress-org-local": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/dist/index.js"],
      "env": {}
    }
  }
}
```

**Important**: Replace `/absolute/path/to/your/project` with the actual full path to your MCP server directory.

### Example Configuration (macOS)

```json
{
  "mcpServers": {
    "wordpress-org-local": {
      "command": "node",
      "args": ["/Users/username/projects/wordpress-org-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

## Step 3: Restart Claude Desktop

After saving the configuration:

1. Completely quit Claude Desktop (not just close the window)
2. Restart Claude Desktop
3. The MCP server should now be available in new conversations

## Step 4: Verify the Connection

In a new Claude conversation, you can verify your MCP server is connected:

1. Look for the MCP server indicator (usually shows connected servers)
2. Try using one of your server's tools or resources
3. Check the server logs if you've implemented logging

## Step 5: Development Workflow

For active development:

1. **Keep TypeScript compiler watching**: Run `npm run dev` to automatically rebuild on changes
2. **Restart Claude Desktop** after making changes to see them take effect
3. **Check logs**: Add console.log statements to debug issues

## Troubleshooting

### Server Not Showing Up

- Verify the path in the config file is absolute and correct
- Check that `dist/index.js` exists after building
- Ensure the JSON configuration is valid (no trailing commas, proper quotes)
- Restart Claude Desktop completely

### Server Crashes

- Check the Claude Desktop developer console for error messages
- Add try-catch blocks and logging to your server code
- Ensure all dependencies are installed (`npm install`)

### Testing Multiple Servers

You can add multiple MCP servers to test them together:

```json
{
  "mcpServers": {
    "wordpress-org-local": {
      "command": "node",
      "args": ["/path/to/wordpress-org-mcp/dist/index.js"]
    },
    "another-server": {
      "command": "node",
      "args": ["/path/to/another-server/dist/index.js"]
    }
  }
}
```

## Alternative: Using npm link (Advanced)

For a more npm-like experience during development:

1. In your MCP server directory:
   ```bash
   npm link
   ```

2. Configure Claude to use the linked package:
   ```json
   {
     "mcpServers": {
       "wordpress-org-local": {
         "command": "npx",
         "args": ["wordpress-org-mcp-server"]
       }
     }
   }
   ```

This approach uses your package's bin configuration and is closer to how users will run your published package.

## Best Practices

1. **Version Control**: Don't commit your local Claude config file
2. **Logging**: Implement proper logging to help debug issues
3. **Error Handling**: Add comprehensive error handling to prevent crashes
4. **Documentation**: Keep your server's README updated with setup instructions
5. **Testing**: Write tests for your MCP server's tools and resources

## Publishing Your MCP Server

Once you've tested locally and are ready to share:

1. Update your `package.json` version
2. Ensure your README has installation instructions
3. Publish to npm: `npm publish`
4. Users can then install with: `npm install -g wordpress-org-mcp-server`

## Example User Configuration (Post-Publishing)

After publishing, users would configure Claude Desktop like this:

```json
{
  "mcpServers": {
    "wordpress-org": {
      "command": "npx",
      "args": ["wordpress-org-mcp-server"]
    }
  }
}
```

This eliminates the need for absolute paths and makes distribution easier.