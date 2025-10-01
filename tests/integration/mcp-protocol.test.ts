import { TestMCPClient, callTool, listTools } from '../utils/test-client.js';
import { cleanupTestDirectories, setupTestDirectories, getTimeout } from '../utils/test-helpers.js';

describe('MCP Protocol Integration', () => {
  let testClient: TestMCPClient;

  beforeAll(async () => {
    await setupTestDirectories();
    testClient = new TestMCPClient();
    await testClient.connect();
  }, getTimeout(30000));

  afterAll(async () => {
    if (testClient) {
      await testClient.disconnect();
    }
    await cleanupTestDirectories();
  }, getTimeout(10000));

  describe('Server Initialization', () => {
    test('should connect to MCP server successfully', async () => {
      const client = testClient.getClient();
      expect(client).toBeDefined();
    });

    test('should list all available tools', async () => {
      const client = testClient.getClient();
      const response = await listTools(client);

      expect(response.tools).toHaveLength(8);

      const toolNames = response.tools.map(tool => tool.name);
      expect(toolNames).toEqual([
        'search_plugins',
        'get_plugin_info',
        'download_plugin',
        'extract_plugin',
        'list_plugin_files',
        'read_plugin_file',
        'compare_plugins',
        'get_file_diff'
      ]);
    });

    test('should have properly structured tool schemas', async () => {
      const client = testClient.getClient();
      const response = await listTools(client);

      // Verify each tool has required properties
      response.tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      });

      // Verify specific tool schemas
      const searchTool = response.tools.find(t => t.name === 'search_plugins');
      expect(searchTool?.inputSchema.properties).toHaveProperty('query');
      expect(searchTool?.inputSchema.properties).toHaveProperty('limit');
      expect(searchTool?.inputSchema.required).toContain('query');

      const compareTool = response.tools.find(t => t.name === 'compare_plugins');
      expect(compareTool?.inputSchema.properties).toHaveProperty('local_path');
      expect(compareTool?.inputSchema.properties).toHaveProperty('wp_org_slug');
      expect(compareTool?.inputSchema.required).toEqual(['local_path', 'wp_org_slug']);
    });
  });

  describe('Tool Execution', () => {
    test('should handle tool execution with valid arguments', async () => {
      const client = testClient.getClient();

      // This test uses a minimal, stable plugin for testing
      const response = await callTool(client, 'get_plugin_info', {
        slug: 'hello-dolly'
      }) as any;

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');

      // Parse the JSON response
      const pluginInfo = JSON.parse(response.content[0].text);
      expect(pluginInfo).toHaveProperty('name');
      expect(pluginInfo).toHaveProperty('slug', 'hello-dolly');
      expect(pluginInfo).toHaveProperty('version');
    }, getTimeout(15000));

    test('should handle tool execution with missing required arguments', async () => {
      const client = testClient.getClient();

      await expect(
        callTool(client, 'get_plugin_info', {})
      ).rejects.toThrow();
    });

    test('should handle invalid tool names', async () => {
      const client = testClient.getClient();

      await expect(
        callTool(client, 'invalid_tool_name', {})
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should return appropriate errors for non-existent plugins', async () => {
      const client = testClient.getClient();

      await expect(
        callTool(client, 'get_plugin_info', {
          slug: 'non-existent-plugin-xyz-12345'
        })
      ).rejects.toThrow(/Plugin not found/);
    });

    test('should handle network timeouts gracefully', async () => {
      const client = testClient.getClient();

      // Test with an invalid slug that would cause API timeout
      await expect(
        callTool(client, 'download_plugin', {
          slug: 'invalid-plugin-that-does-not-exist-anywhere'
        })
      ).rejects.toThrow();
    }, getTimeout(20000));
  });

  describe('Response Format Validation', () => {
    test('should return properly formatted MCP responses', async () => {
      const client = testClient.getClient();

      const response = await callTool(client, 'search_plugins', {
        query: 'security',
        limit: 3
      }) as any;

      // Validate MCP response structure
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content).toHaveLength(1);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');

      // Validate content is valid JSON
      const plugins = JSON.parse(response.content[0].text);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBeLessThanOrEqual(3);

      if (plugins.length > 0) {
        // Validate plugin structure
        const plugin = plugins[0];
        expect(plugin).toHaveProperty('name');
        expect(plugin).toHaveProperty('slug');
        expect(plugin).toHaveProperty('version');
        expect(plugin).toHaveProperty('download_link');
      }
    }, getTimeout(15000));
  });
});