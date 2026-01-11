/**
 * Cross-runtime file utilities (works with Node.js and Bun)
 */

import { readFile, writeFile, appendFile, access, constants } from 'node:fs/promises';

/**
 * Check if a file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file contents as text
 */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

/**
 * Write content to file (overwrites existing)
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf-8');
}

/**
 * Append content to file
 */
export async function appendTextFile(path: string, content: string): Promise<void> {
  await appendFile(path, content, 'utf-8');
}
