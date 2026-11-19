import crypto from 'node:crypto'
import fsp from 'node:fs/promises'

/**
 * Remembers a hash of the last bytes seen for each watched file, so a change
 * event that leaves the file byte-for-byte identical (a formatter that changes
 * nothing, an editor's "save all", a branch switch that restores a file) can
 * be recognised and skipped instead of invalidating modules and sending HMR.
 *
 * It only ever compares with the *current* content, never with older
 * versions: A -> B -> A still counts as a change, because the browser is
 * running B at that point.
 */
export interface FileContentTracker {
  /**
   * Reads the file and reports whether its bytes differ from the last bytes
   * recorded for it. The new hash is recorded either way.
   */
  hasChanged(file: string): Promise<boolean>
  /** Records the file's current bytes without asking whether they changed. */
  remember(file: string): Promise<void>
  /** Drops what we know about the file, e.g. after it was deleted. */
  forget(file: string): void
}

export function createFileContentTracker(): FileContentTracker {
  const lastHashByFile = new Map<string, string>()

  async function hasChanged(file: string): Promise<boolean> {
    const hash = await readContentHash(file)
    if (hash === undefined) {
      // We could not get a trustworthy snapshot of the file, so we cannot
      // prove nothing changed. Let the normal update run.
      lastHashByFile.delete(file)
      return true
    }

    const previousHash = lastHashByFile.get(file)
    lastHashByFile.set(file, hash)
    // The first time we see a file we have nothing to compare with, so it
    // counts as changed.
    return previousHash !== hash
  }

  async function remember(file: string): Promise<void> {
    await hasChanged(file)
  }

  function forget(file: string): void {
    lastHashByFile.delete(file)
  }

  return { hasChanged, remember, forget }
}

/**
 * Returns a hash of the file's bytes, or `undefined` when the file can't be
 * read or looks empty. Editors sometimes truncate a file before writing it
 * (see vitejs/vite#610), so an empty read is treated as "unknown" rather than
 * recorded as the file's content.
 */
async function readContentHash(file: string): Promise<string | undefined> {
  let content: Buffer
  try {
    content = await fsp.readFile(file)
  } catch {
    return undefined
  }
  if (content.length === 0) {
    return undefined
  }
  return crypto.hash('sha256', content, 'base64')
}
