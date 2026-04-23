#!/usr/bin/env node
import { run } from '../src/index.js'

run().catch((err) => {
  console.error('[cms-mcp] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
