import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import pkg from '../../../package.json' with { type: 'json' };

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageDeps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
function isExternal(id) {
    if (builtins.has(id) || id.startsWith('node:')) {
        return true;
    }
    for (const dep of packageDeps) {
        if (id === dep || id.startsWith(`${dep}/`)) {
            return true;
        }
    }
    return false;
}
export default {
    input: {
        index: resolve(rootDir, 'src/index.ts'),
        browser: resolve(rootDir, 'src/browser.ts'),
        node: resolve(rootDir, 'src/node.ts'),
        'core/fast-path-strategy': resolve(rootDir, 'src/core/fast-path-strategy.ts'),
        'worker-browser': resolve(rootDir, 'src/worker-browser.ts'),
        'worker-node': resolve(rootDir, 'src/worker-node.ts'),
    },
    external: isExternal,
    treeshake: false,
    output: {
        dir: resolve(rootDir, 'dist'),
        format: 'es',
        sourcemap: true,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        preserveModules: true,
        preserveModulesRoot: resolve(rootDir, 'src'),
    },
    plugins: [
        nodeResolve({
            exportConditions: ['import', 'default'],
            preferBuiltins: true,
        }),
        commonjs(),
        typescript({
            tsconfig: resolve(rootDir, 'tsconfig.json'),
            include: ['src/**/*.ts'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: false,
            declaration: false,
            declarationMap: false,
            sourceMap: true,
        }),
    ],
};
