import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const zizmor = resolveZizmor();

const result = spawnSync(zizmor, ['--config', '.config/shirika/security/zizmor.yml', '--offline', '--min-severity', 'low', '.github/workflows'], {
    cwd: rootDir,
    stdio: 'inherit',
});

if (result.error) {
    console.error(`Unable to run zizmor: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);

function resolveZizmor() {
    const executable = process.platform === 'win32' ? 'zizmor.exe' : 'zizmor';
    const userInstallPath = process.env.APPDATA ? path.join(process.env.APPDATA, 'Python', 'Python310', 'Scripts', executable) : undefined;
    if (userInstallPath && existsSync(userInstallPath)) {
        return userInstallPath;
    }
    return executable;
}
