// src/modules/scans/pipeline/utils/file-stats.ts
// Utility to calculate file statistics from a directory

import { promises as fs } from 'fs';
import * as path from 'path';

export interface DirectoryStats {
  filesScanned: number;
  linesOfCode: number;
  sizeBytes: number;
}

const IGNORE_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'dist', 'build', 'coverage', '.next', 'vendor', 
  '.idea', '.vscode', '__pycache__', 'target', 'bin', 'obj'
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.pdf', '.zip', '.tar', '.gz',
  '.mp4', '.mp3', '.mov', '.avi', '.woff', '.woff2', '.ttf', '.eot', '.exe', '.dll', '.so', '.dylib', '.class', '.jar',
  '.psd', '.ai', '.sketch', '.fig', '.sqlite', '.db'
]);

/**
 * Calculate stats for a directory recursively
 * Skips binary files and common ignored directories
 */
export async function getDirectoryStats(dirPath: string): Promise<DirectoryStats> {
  const stats = {
    filesScanned: 0,
    linesOfCode: 0,
    sizeBytes: 0
  };

  await walk(dirPath, stats);

  return stats;
}

async function walk(currentPath: string, stats: DirectoryStats) {
  try {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await walk(fullPath, stats);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Skip obvious binaries
        if (BINARY_EXTENSIONS.has(ext)) continue;
        
        // Skip dotfiles (hidden files) unless explicitly allowed? usually unsafe/config
        if (entry.name.startsWith('.')) continue;

        try {
          const fileStat = await fs.stat(fullPath);
          stats.filesScanned++;
          stats.sizeBytes += fileStat.size;

          // Skip counting lines for large files (> 500KB) to save time
          if (fileStat.size > 500 * 1024) continue;

          // Simple newline counting
          const content = await fs.readFile(fullPath, 'utf8');
          // Check for null bytes to detect binary files without extension
          if (content.indexOf('\0') !== -1) {
             stats.filesScanned--; // Revert count, it's binary
             stats.sizeBytes -= fileStat.size;
             continue;
          }

          let lines = 0;
          for (const char of content) {
            if (char === '\n') lines++;
          }
          if (content.length > 0 && content[content.length - 1] !== '\n') lines++;
          
          stats.linesOfCode += lines;
        } catch (readErr) {
          // Ignore read errors
        }
      }
    }
  } catch (dirErr) {
    // Ignore access errors
  }
}
