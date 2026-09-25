import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { getDistImportSpecifier } from './import-specifier.mjs'

for (const directory of ['repo', 'repo with spaces # and %']) {
  test(`builds a file URL import specifier for ${directory}`, () => {
    const root = process.platform === 'win32' ? 'C:\\' : '/'
    const repoDir = join(root, directory)
    const specifier = getDistImportSpecifier(join(repoDir, 'bin'))

    assert.equal(new URL(specifier).protocol, 'file:')
    assert.equal(new URL(specifier).hash, '')
    assert.equal(fileURLToPath(specifier), join(repoDir, 'dist', 'cli.mjs'))
  })
}
