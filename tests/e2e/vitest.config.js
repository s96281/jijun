import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
const APP_VERSION = pkg.version || '2.1.8.5'
const webStoreUrl = pkg.webStoreUrl || (pkg.adConfig && pkg.adConfig.webStoreUrl) || 'https://jijun.the-walking-fish.com'

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __WEB_STORE_URL__: JSON.stringify(webStoreUrl),
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [resolve(__dirname, './setup.js')],
        include: ['tests/e2e/**/*.test.js'],
        sequence: { concurrent: false },
        pool: 'threads',
        testTimeout: 60000,
    },
})
