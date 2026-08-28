import { defineConfig } from 'vite';
import path from 'path';

// Production build of the full QR Studio app (index.html) — the library build
// (vite.config.ts) packages the component for npm; this one produces a static
// site that nginx can serve. qrlayout-core is bundled from source via alias.
export default defineConfig({
    base: './',
    build: {
        outDir: 'dist/app',
        emptyOutDir: true
    },
    resolve: {
        alias: {
            '@qrlayout/core': path.resolve(__dirname, '../core/src/index.ts'),
            'qrlayout-core': path.resolve(__dirname, '../core/src/index.ts')
        }
    },
    server: {
        fs: { allow: ['..'] }
    }
});
