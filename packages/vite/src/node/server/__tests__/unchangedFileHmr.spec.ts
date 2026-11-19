import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createServer } from '../index'
import type { ViteDevServer } from '../index'

// The watched file lives outside the server root, so chokidar never reports
// it on its own and the only change events are the ones these tests emit.
let root: string
let outsideDir: string
let file: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-unchanged-root-'))
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-unchanged-file-'))
  file = path.join(outsideDir, 'main.js').replaceAll('\\', '/')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outsideDir, { recursive: true, force: true })
})

async function createCountingServer() {
  const calls = { watchChange: 0, hotUpdate: 0 }
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
    plugins: [
      {
        name: 'count-change-events',
        watchChange(id) {
          if (id === file) calls.watchChange++
        },
        hotUpdate({ file: changedFile }) {
          // hotUpdate runs once per environment; count the client one only.
          if (changedFile === file && this.environment.name === 'client') {
            calls.hotUpdate++
          }
        },
      },
    ],
  })
  return { server, calls }
}

async function emitChange(
  server: ViteDevServer,
  calls: { watchChange: number },
): Promise<void> {
  const before = calls.watchChange
  server.watcher.emit('change', file)
  await vi.waitFor(() => expect(calls.watchChange).toBe(before + 1))
  // Give a real update time to reach the hotUpdate hook.
  await new Promise((resolve) => setTimeout(resolve, 50))
}

test('a save that leaves the file unchanged does not send an HMR update', async () => {
  const { server, calls } = await createCountingServer()
  try {
    fs.writeFileSync(file, 'export const a = 1')
    await emitChange(server, calls)
    expect(calls.hotUpdate).toBe(1)

    // Same bytes written again, e.g. a formatter that changed nothing.
    fs.writeFileSync(file, 'export const a = 1')
    await emitChange(server, calls)

    // Plugins still hear about the event, but no update runs.
    expect(calls.watchChange).toBe(2)
    expect(calls.hotUpdate).toBe(1)
  } finally {
    await server.close()
  }
})

test('a real change and a revert both send an HMR update', async () => {
  const { server, calls } = await createCountingServer()
  try {
    fs.writeFileSync(file, 'export const a = 1')
    await emitChange(server, calls)

    fs.writeFileSync(file, 'export const a = 2')
    await emitChange(server, calls)

    fs.writeFileSync(file, 'export const a = 1')
    await emitChange(server, calls)

    expect(calls.hotUpdate).toBe(3)
  } finally {
    await server.close()
  }
})
