import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const loadPackageVersion = (): string => {
  for (const packageJsonPath of ['../package.json', '../../package.json']) {
    try {
      return (require(packageJsonPath) as { version?: string }).version ?? '0.0.0'
    } catch {
      // Source files resolve ../package.json; built files resolve ../../package.json.
    }
  }
  return '0.0.0'
}

export const VERSION = loadPackageVersion()
