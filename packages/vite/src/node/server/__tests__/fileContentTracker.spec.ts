import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createFileContentTracker } from '../fileContentTracker'

describe('createFileContentTracker', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-file-content-'))
    file = path.join(dir, 'main.js')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('counts the first sighting of a file as a change', async () => {
    fs.writeFileSync(file, 'export const a = 1')
    const tracker = createFileContentTracker()

    expect(await tracker.hasChanged(file)).toBe(true)
  })

  test('reports no change when the bytes are the same as last time', async () => {
    fs.writeFileSync(file, 'export const a = 1')
    const tracker = createFileContentTracker()
    await tracker.remember(file)

    fs.writeFileSync(file, 'export const a = 1')

    expect(await tracker.hasChanged(file)).toBe(false)
  })

  test('reports a change when the bytes differ', async () => {
    fs.writeFileSync(file, 'export const a = 1')
    const tracker = createFileContentTracker()
    await tracker.remember(file)

    fs.writeFileSync(file, 'export const a = 2')

    expect(await tracker.hasChanged(file)).toBe(true)
  })

  test('compares with the current content only, so a revert is a change', async () => {
    const tracker = createFileContentTracker()
    fs.writeFileSync(file, 'A')
    await tracker.remember(file)
    fs.writeFileSync(file, 'B')
    expect(await tracker.hasChanged(file)).toBe(true)

    fs.writeFileSync(file, 'A')

    expect(await tracker.hasChanged(file)).toBe(true)
  })

  test('treats an empty read as a change and does not record it', async () => {
    const tracker = createFileContentTracker()
    fs.writeFileSync(file, 'A')
    await tracker.remember(file)

    fs.writeFileSync(file, '')
    expect(await tracker.hasChanged(file)).toBe(true)

    // Nothing was recorded for the empty read, so writing A back is a change.
    fs.writeFileSync(file, 'A')
    expect(await tracker.hasChanged(file)).toBe(true)
  })

  test('treats an unreadable file as a change', async () => {
    const tracker = createFileContentTracker()

    expect(await tracker.hasChanged(path.join(dir, 'missing.js'))).toBe(true)
  })

  test('forget drops the recorded content', async () => {
    fs.writeFileSync(file, 'A')
    const tracker = createFileContentTracker()
    await tracker.remember(file)

    tracker.forget(file)

    expect(await tracker.hasChanged(file)).toBe(true)
  })
})
