// src/utils/async-exec.ts
// Non-blocking async wrappers for CLI operations

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

const execPromise = promisify(exec);

/**
 * Async wrapper for executing shell commands without blocking event loop
 * Uses spawn internally for large outputs
 */
export async function asyncExec(
  command: string,
  options?: {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
    env?: NodeJS.ProcessEnv;
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", command], {
      cwd: options?.cwd,
      timeout: options?.timeout,
      env: { ...process.env, ...options?.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const maxBuffer = options?.maxBuffer || 50 * 1024 * 1024;

    child.stdout?.on("data", (data) => {
      stdout += data;
      if (stdout.length > maxBuffer) {
        child.kill();
        reject(new Error(`stdout exceeded ${maxBuffer} bytes`));
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += data;
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    if (options?.timeout) {
      setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}

/**
 * Check if a command is available without blocking
 */
export async function asyncCommandExists(command: string): Promise<boolean> {
  try {
    await asyncExec(`command -v ${command}`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create temporary directory asynchronously
 */
export async function asyncMkdtemp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Write file asynchronously
 */
export async function asyncWriteFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf8"
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, encoding);
}

/**
 * Read file asynchronously
 */
export async function asyncReadFile(
  filePath: string,
  encoding: BufferEncoding = "utf8"
): Promise<string> {
  return fs.readFile(filePath, encoding);
}

/**
 * Delete file/directory asynchronously
 */
export async function asyncRmdir(
  dirPath: string,
  options?: { recursive?: boolean; force?: boolean }
): Promise<void> {
  try {
    await fs.rm(dirPath, {
      recursive: options?.recursive ?? true,
      force: options?.force ?? true,
    });
  } catch (err) {
    // Ignore errors for non-existent files
    if ((err as any).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check file exists asynchronously
 */
export async function asyncFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Yield to event loop to keep it responsive
 * Use this between batch operations
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Process items in batches with event loop yielding
 */
export async function asyncBatchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Yield to event loop between batches
    if (i + batchSize < items.length) {
      await yieldToEventLoop();
    }
  }

  return results;
}
