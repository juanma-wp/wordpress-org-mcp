import * as os from 'os';
import * as path from 'path';

export class SystemPaths {
  /**
   * Get the appropriate cache directory for the current platform
   */
  static getCacheDir(): string {
    const platform = os.platform();

    switch (platform) {
      case 'darwin': // macOS
        return path.join(os.homedir(), 'Library', 'Caches', 'wordpress-org-mcp');
      case 'win32': // Windows
        return path.join(os.homedir(), 'AppData', 'Local', 'wordpress-org-mcp', 'Cache');
      default: // Linux and others
        const xdgCacheHome = process.env.XDG_CACHE_HOME;
        if (xdgCacheHome) {
          return path.join(xdgCacheHome, 'wordpress-org-mcp');
        }
        return path.join(os.homedir(), '.cache', 'wordpress-org-mcp');
    }
  }

  /**
   * Get the appropriate temporary directory for extractions
   */
  static getTempDir(): string {
    return path.join(os.tmpdir(), 'wordpress-org-mcp-extractions');
  }

  /**
   * Get the appropriate data directory for persistent storage
   */
  static getDataDir(): string {
    const platform = os.platform();

    switch (platform) {
      case 'darwin': // macOS
        return path.join(os.homedir(), 'Library', 'Application Support', 'wordpress-org-mcp');
      case 'win32': // Windows
        return path.join(os.homedir(), 'AppData', 'Roaming', 'wordpress-org-mcp');
      default: // Linux and others
        const xdgDataHome = process.env.XDG_DATA_HOME;
        if (xdgDataHome) {
          return path.join(xdgDataHome, 'wordpress-org-mcp');
        }
        return path.join(os.homedir(), '.local', 'share', 'wordpress-org-mcp');
    }
  }
}