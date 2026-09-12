const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const DIST_SERVER = path.join(ROOT, 'dist-server');
const OUT_FILE = path.join(DIST_SERVER, 'server.bundle.js');

async function bundleServer() {
    console.log('[Bundle Server] Bundling server.js and all internal modules with esbuild...');
    if (!fs.existsSync(DIST_SERVER)) {
        fs.mkdirSync(DIST_SERVER, { recursive: true });
    }

    await esbuild.build({
        entryPoints: [path.join(ROOT, 'server.js')],
        outfile: OUT_FILE,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        external: ['7zip-bin'],
        banner: {
            js: '/* LanDisk Standalone Server Bundle - Auto Generated */\n'
        },
        logLevel: 'info'
    });

    const stat = fs.statSync(OUT_FILE);
    console.log(`[Bundle Server] Successfully created ${OUT_FILE} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

if (require.main === module) {
    bundleServer().catch(err => {
        console.error('[Bundle Server] Error:', err);
        process.exit(1);
    });
}

module.exports = { bundleServer, DIST_SERVER, OUT_FILE };
