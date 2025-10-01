import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

/**
 * Test client wrapper for MCP integration testing.
 * Manages server process lifecycle and client connections.
 */
export class TestMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  /**
   * Start the MCP server and create a client connection.
   */
  async connect(): Promise<Client> {
    if (this.client) {
      throw new Error('Client is already connected');
    }

    // Use StdioClientTransport to spawn the server process
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        // Use test directories to avoid conflicts
        WP_MCP_CACHE_DIR: path.join(process.cwd(), 'test-cache'),
        WP_MCP_EXTRACT_DIR: path.join(process.cwd(), 'test-extracted')
      }
    });

    this.client = new Client(
      {
        name: 'test-client',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    // Connect the client
    await this.client.connect(this.transport);

    // Give the connection a moment to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));

    return this.client;
  }

  /**
   * Close the client connection and terminate the server process.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore close errors during cleanup
      }
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        // Ignore close errors during cleanup
      }
    }

    this.client = null;
    this.transport = null;
  }

  /**
   * Get the connected client instance.
   */
  getClient(): Client {
    if (!this.client) {
      throw new Error('Client is not connected. Call connect() first.');
    }
    return this.client;
  }
}

/**
 * Create a test client instance with automatic cleanup.
 */
export async function createTestClient(): Promise<TestMCPClient> {
  const testClient = new TestMCPClient();
  await testClient.connect();
  return testClient;
}

/**
 * Utility function to call an MCP tool and return the result.
 */
export async function callTool(client: Client, name: string, arguments_?: any) {
  const response = await client.callTool({ name, arguments: arguments_ || {} });
  return response;
}

/**
 * Utility function to list available MCP tools.
 */
export async function listTools(client: Client) {
  const response = await client.listTools();
  return response;
}