import { readFileCached, toLinesCached } from "./file-cache.js";

/** Pre-processed file data shared across engines */
export interface FileData {
  /** Absolute path to the file */
  filePath: string;
  /** Full file content */
  content: string;
  /** Line map with 1-based line numbers */
  lines: { num: number; text: string }[];
}

/** In-memory batch cache shared across engines within a single scan run */
const batchCache = new Map<string, FileData>();

/**
 * Process a batch of files once, sharing loaded content and line maps.
 * Files are loaded lazily and cached, so subsequent calls for the same
 * paths return the cached data without re-reading or re-splitting.
 */
export async function processFiles(
  filePaths: string[],
  callback: (file: FileData) => void | Promise<void>,
): Promise<void> {
  // Load uncached files in parallel
  const uncached = filePaths.filter((fp) => !batchCache.has(fp));
  if (uncached.length > 0) {
    await Promise.all(
      uncached.map(async (fp) => {
        try {
          const content = await readFileCached(fp);
          const lines = await toLinesCached(fp);
          batchCache.set(fp, { filePath: fp, content, lines });
        } catch {
          // Skip unreadable files
        }
      }),
    );
  }

  // Process files in order
  for (const fp of filePaths) {
    const file = batchCache.get(fp);
    if (file) {
      await callback(file);
    }
  }
}

/** Clear the shared batch cache (call between scan runs) */
export function clearBatch(): void {
  batchCache.clear();
}
