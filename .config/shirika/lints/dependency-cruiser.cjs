/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            comment: 'Cycles make transport lifecycle and worker teardown bugs very hard to reason about.',
            from: {},
            to: { circular: true },
        },
        {
            name: 'core-must-not-import-adapters',
            severity: 'error',
            from: { path: '^src/core/' },
            to: { path: '^src/adapters/' },
        },
        {
            name: 'browser-must-not-import-node-builtins',
            severity: 'error',
            from: { path: '^(src/browser|src/adapters/browser-|src/worker-browser)' },
            to: { path: '^node:' },
        },
        {
            name: 'no-dist-imports',
            severity: 'error',
            from: {},
            to: { path: '^dist/' },
        },
        {
            name: 'tests-do-not-leak-into-src',
            severity: 'error',
            from: { path: '^src/' },
            to: { path: '^(test|test-d)/' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '^(dist|coverage|[.]bench|node_modules)/' },
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        reporterOptions: {
            dot: { collapsePattern: 'node_modules/[^/]+' },
        },
    },
};
