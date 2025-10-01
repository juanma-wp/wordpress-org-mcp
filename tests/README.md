# WordPress.org MCP Server Tests

This directory contains comprehensive tests for the WordPress.org MCP server, including unit tests for individual components and integration tests for MCP protocol communication.

## Test Structure

```
tests/
├── integration/           # MCP protocol integration tests
│   ├── mcp-protocol.test.ts      # Server initialization & protocol tests
│   └── tool-functionality.test.ts # Individual tool functionality tests
├── utils/                # Test utilities and helpers
│   ├── test-client.ts    # MCP client setup and management
│   └── test-helpers.ts   # Common test utilities
├── unit/                 # Unit tests for individual components
│   ├── plugin-comparator.test.ts
│   ├── plugin-extractor.test.ts
│   └── setup.ts
└── README.md            # This file
```

## Test Categories

### Unit Tests
Tests individual components in isolation:
- **PluginComparator**: Plugin comparison logic and diff generation
- **PluginExtractor**: ZIP file extraction and file operations

### Integration Tests
Tests the complete MCP server functionality:
- **MCP Protocol**: Server initialization, tool listing, error handling
- **Tool Functionality**: End-to-end testing of all MCP tools with real WordPress.org API

## Running Tests

### All Tests
```bash
npm run test:all          # Run both unit and integration tests
```

### Unit Tests Only
```bash
npm test                  # Default test command (unit tests only)
npm run test:unit         # Explicit unit tests
npm run test:watch        # Watch mode for unit tests during development
npm run test:coverage     # Unit tests with coverage report
```

### Integration Tests Only
```bash
npm run test:integration  # Integration tests (builds project first)
```

## Test Environment

### Prerequisites
- Project must be built (`npm run build`) before running integration tests
- Integration tests use temporary directories for caching and extraction:
  - `test-cache/` - Downloaded plugin ZIP files
  - `test-extracted/` - Extracted plugin contents
  - `test-fixtures/` - Mock plugin structures

### Environment Variables
Integration tests automatically set:
- `WP_MCP_CACHE_DIR=./test-cache`
- `WP_MCP_EXTRACT_DIR=./test-extracted`

### Network Requirements
Integration tests make real API calls to WordPress.org:
- Requires internet connection
- Uses stable, small plugins like `hello-dolly` for testing
- Includes retry logic and appropriate timeouts for network operations

## Test Timeouts
- **Unit tests**: 30 seconds (default)
- **Integration tests**: 60 seconds (configured in package.json)
- **Individual operations**: Adjusted for CI environments (2x timeout in CI)

## CI/CD Integration
Tests are designed to work in automated environments:
- Automatic timeout adjustments for slower CI environments
- Proper cleanup of temporary files and processes
- Graceful handling of network failures and retries

## Writing New Tests

### Unit Tests
Add new unit tests in the existing test files or create new ones following the pattern:
```typescript
import { YourComponent } from '../src/your-component.js';

describe('YourComponent', () => {
  test('should do something', () => {
    // Test implementation
  });
});
```

### Integration Tests
For new MCP tools or protocol features:
```typescript
import { TestMCPClient, callTool } from '../utils/test-client.js';

describe('New Feature Integration', () => {
  let testClient: TestMCPClient;

  beforeAll(async () => {
    testClient = new TestMCPClient();
    await testClient.connect();
  });

  afterAll(async () => {
    await testClient.disconnect();
  });

  test('should test new functionality', async () => {
    const response = await callTool(testClient.getClient(), 'new_tool', {});
    expect(response).toBeDefined();
  });
});
```

## Debugging Tests

### Verbose Output
```bash
npm run test:integration -- --verbose
```

### Single Test File
```bash
npx jest tests/integration/mcp-protocol.test.ts
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest tests/integration/mcp-protocol.test.ts --runInBand
```

## Common Issues

### Integration Test Failures
1. **Server connection errors**: Ensure project is built (`npm run build`)
2. **Network timeouts**: Check internet connection, tests make real API calls
3. **Port conflicts**: Integration tests spawn server processes, ensure ports are available

### Unit Test Failures
1. **Import errors**: Check TypeScript compilation and module paths
2. **Mock setup**: Verify test setup and teardown in `setup.ts`

### General Troubleshooting
1. Clean temporary directories: `rm -rf test-cache test-extracted test-fixtures`
2. Rebuild project: `npm run build`
3. Update dependencies: `npm ci`