#!/usr/bin/env node

import { WordPressOrgMCPServer } from './index.js';

const server = new WordPressOrgMCPServer();
server.run().catch(console.error);