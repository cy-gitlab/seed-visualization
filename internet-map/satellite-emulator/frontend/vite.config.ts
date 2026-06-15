import {fileURLToPath, URL} from 'node:url';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';
import {defineConfig, loadEnv} from 'vite';

const envDir = fileURLToPath(new URL('./env', import.meta.url));

function readNumberEnv(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(value: string | undefined, fallback: boolean) {
    if (value === undefined) {
        return fallback;
    }

    return value === 'true';
}

function readMinifyEnv(value: string | undefined) {
    if (value === 'false') {
        return false;
    }

    if (value === 'terser') {
        return 'terser';
    }

    return 'esbuild';
}

function createDevProxy(env: Record<string, string>) {
    const prefix = env.VITE_SERVER_URL_PREFIX || '/api/v1';
    const target = env.VITE_PROXY_ADDRESS;
    if (!target) {
        return undefined;
    }

    return {
        [prefix]: {
            target,
            changeOrigin: true,
        },
        '/satellite-tiles': {
            target: env.VITE_SATELLITE_TILES_PROXY_ADDRESS,
            changeOrigin: true,
        },
    };
}

export default defineConfig(({mode, command}) => {
    const env = loadEnv(mode, envDir, '');
    const isBuild = command === 'build';
    const assetBase = isBuild ? env.VITE_BUILD_ASSET_PREFIX || '/' : '/';
    const cesiumBaseUrl = isBuild
        ? env.VITE_CESIUM_BASE_URL || '../cesium'
        : '/cesium';

    return {
        envDir,
        base: assetBase,
        plugins: [
            vue(),
            cesium({
                cesiumBaseUrl: cesiumBaseUrl,
            }),
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        server: {
            host: env.VITE_FRONTEND_HOST || '127.0.0.1',
            port: readNumberEnv(env.VITE_FRONTEND_PORT, 5173),
            open: env.VITE_FRONTEND_OPEN === 'true',
            proxy: createDevProxy(env),
        },
        build: {
            outDir: env.VITE_BUILD_OUTPUT_PATH || 'dist',
            assetsDir: 'assets',
            emptyOutDir: true,
            sourcemap: readBooleanEnv(env.VITE_BUILD_SOURCEMAP, false),
            minify: readMinifyEnv(env.VITE_BUILD_MINIFY),
            chunkSizeWarningLimit: readNumberEnv(env.VITE_BUILD_CHUNK_SIZE_WARNING_LIMIT, 1800),
            rollupOptions: {
                output: {
                    manualChunks: {
                        vue: ['vue', 'vue-router'],
                        elementPlus: ['element-plus', '@element-plus/icons-vue'],
                        satellite: ['satellite.js'],
                    },
                },
            },
        },
    };
});
