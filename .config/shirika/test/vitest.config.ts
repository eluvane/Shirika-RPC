import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, defineProject } from 'vitest/config';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const crossOriginIsolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

export default defineConfig({
    root: rootDir,
    server: {
        host: '127.0.0.1',
        headers: crossOriginIsolationHeaders,
    },
    test: {
        globals: true,
        projects: [
            defineProject({
                test: {
                    name: 'node',
                    include: ['test/node/**/*.test.ts'],
                    environment: 'node',
                    setupFiles: ['@vitest/web-worker'],
                    pool: 'threads',
                    testTimeout: 20000,
                    hookTimeout: 20000,
                },
            }),
            defineProject({
                server: {
                    host: '127.0.0.1',
                    headers: crossOriginIsolationHeaders,
                },
                test: {
                    name: 'browser',
                    include: ['test/browser/**/*.test.ts'],
                    browser: {
                        enabled: true,
                        api: {
                            host: '127.0.0.1',
                        },
                        provider: playwright({
                            launchOptions: {
                                headless: true,
                            },
                        }),
                        instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
                    },
                    testTimeout: 25000,
                    hookTimeout: 25000,
                },
            }),
        ],
    },
});
