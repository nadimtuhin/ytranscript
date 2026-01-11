/**
 * Tests for cross-runtime file utilities
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { fileExists, readTextFile, writeTextFile, appendTextFile } from '../src/lib/fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('fs utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ytranscript-fs-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('fileExists', () => {
    test('returns true for existing file', async () => {
      const path = join(tempDir, 'exists.txt');
      await writeTextFile(path, 'content');

      expect(await fileExists(path)).toBe(true);
    });

    test('returns false for non-existent file', async () => {
      const path = join(tempDir, 'does-not-exist.txt');

      expect(await fileExists(path)).toBe(false);
    });

    test('returns false for non-existent directory', async () => {
      const path = join(tempDir, 'nonexistent', 'file.txt');

      expect(await fileExists(path)).toBe(false);
    });
  });

  describe('readTextFile', () => {
    test('reads file content as string', async () => {
      const path = join(tempDir, 'read.txt');
      await writeTextFile(path, 'Hello, world!');

      const content = await readTextFile(path);

      expect(content).toBe('Hello, world!');
    });

    test('reads file with unicode content', async () => {
      const path = join(tempDir, 'unicode.txt');
      const unicodeContent = '日本語 🎉 émoji';
      await writeTextFile(path, unicodeContent);

      const content = await readTextFile(path);

      expect(content).toBe(unicodeContent);
    });

    test('throws error for non-existent file', async () => {
      const path = join(tempDir, 'does-not-exist.txt');

      await expect(readTextFile(path)).rejects.toThrow();
    });
  });

  describe('writeTextFile', () => {
    test('creates new file with content', async () => {
      const path = join(tempDir, 'new.txt');

      await writeTextFile(path, 'new content');

      expect(await fileExists(path)).toBe(true);
      expect(await readTextFile(path)).toBe('new content');
    });

    test('overwrites existing file', async () => {
      const path = join(tempDir, 'overwrite.txt');
      await writeTextFile(path, 'original');
      await writeTextFile(path, 'updated');

      expect(await readTextFile(path)).toBe('updated');
    });

    test('writes empty string', async () => {
      const path = join(tempDir, 'empty.txt');

      await writeTextFile(path, '');

      expect(await fileExists(path)).toBe(true);
      expect(await readTextFile(path)).toBe('');
    });

    test('writes multiline content', async () => {
      const path = join(tempDir, 'multiline.txt');
      const multilineContent = 'line1\nline2\nline3';

      await writeTextFile(path, multilineContent);

      expect(await readTextFile(path)).toBe(multilineContent);
    });
  });

  describe('appendTextFile', () => {
    test('appends to existing file', async () => {
      const path = join(tempDir, 'append.txt');
      await writeTextFile(path, 'first\n');

      await appendTextFile(path, 'second\n');

      expect(await readTextFile(path)).toBe('first\nsecond\n');
    });

    test('creates file if it does not exist', async () => {
      const path = join(tempDir, 'new-append.txt');

      await appendTextFile(path, 'appended content');

      expect(await fileExists(path)).toBe(true);
      expect(await readTextFile(path)).toBe('appended content');
    });

    test('appends multiple times', async () => {
      const path = join(tempDir, 'multi-append.txt');

      await appendTextFile(path, 'a');
      await appendTextFile(path, 'b');
      await appendTextFile(path, 'c');

      expect(await readTextFile(path)).toBe('abc');
    });
  });
});
