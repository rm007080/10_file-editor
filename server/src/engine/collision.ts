import type { PreviewResult } from '@app/shared';

/**
 * Detect collisions in rename results.
 *
 * Checks for:
 * 1. Multiple source files mapping to the same new name (within rename targets)
 * 2. New names colliding with existing files that are NOT being renamed
 *
 * All comparisons are case-insensitive (NTFS is case-insensitive).
 */
export function detectCollisions(
  results: PreviewResult[],
  allFilesInDir: string[],
): PreviewResult[] {
  // 1. Build a map: lowercased new name → list of original names
  const newNameMap = new Map<string, string[]>();
  for (const result of results) {
    const lower = result.newName.toLowerCase();
    const list = newNameMap.get(lower);
    if (list) {
      list.push(result.originalName);
    } else {
      newNameMap.set(lower, [result.originalName]);
    }
  }

  // 2. Detect collisions among rename targets
  for (const result of results) {
    const lower = result.newName.toLowerCase();
    const sources = newNameMap.get(lower)!;
    if (sources.length > 1) {
      result.hasCollision = true;
      result.collisionWith = sources.find((s) => s !== result.originalName);
    }
  }

  // 3. Detect collisions with existing files NOT in the rename set
  const renamedOriginals = new Set(results.map((r) => r.originalName.toLowerCase()));

  for (const result of results) {
    if (result.hasCollision) continue;
    // Skip unchanged files — they can't collide with themselves
    if (!result.hasChanged) continue;

    const lower = result.newName.toLowerCase();
    const collidingFile = allFilesInDir.find(
      (f) => f.toLowerCase() === lower && !renamedOriginals.has(f.toLowerCase()),
    );

    if (collidingFile) {
      result.hasCollision = true;
      result.collisionWith = collidingFile;
    }
  }

  return results;
}
