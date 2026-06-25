/** @type {import('syncpack').RcFile} */
module.exports = {
    source: ['package.json'],
    semverGroups: [
        {
            label: 'Runtime dependencies use caret ranges for compatible patch/minor updates',
            range: '^',
            dependencyTypes: ['prod'],
            dependencies: ['$LOCAL'],
            packages: ['**'],
        },
        {
            label: 'Pinned browser/test runners stay exact for reproducible CI',
            range: '',
            dependencyTypes: ['dev'],
            dependencies: ['vitest', '@vitest/**'],
            packages: ['**'],
        },
    ],
    versionGroups: [
        {
            label: 'Vitest packages move together',
            packages: ['**'],
            dependencies: ['vitest', '@vitest/**'],
            dependencyTypes: ['dev'],
            policy: 'sameRange',
        },
    ],
};
