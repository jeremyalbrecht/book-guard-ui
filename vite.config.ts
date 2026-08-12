import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The app renders client-side (see src/routes/+layout.ts), so the build
			// is a static bundle Traefik can serve next to the Go API. `fallback`
			// makes every route — including /books/{id} — resolve to the app shell.
			adapter: adapter({ fallback: 'index.html' })
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// No URL strategy: the app is a static client-rendered bundle, so there is
			// no server to read a cookie or rewrite a localised path. An explicit
			// choice in localStorage wins, otherwise the browser's own language
			// decides, otherwise French.
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		})
	],

	server: {
		proxy: {
			// The Go API has no CORS middleware, and in production both sit behind
			// the same Traefik host — so dev talks to it through a same-origin proxy
			// rather than the backend growing CORS it doesn't otherwise need.
			// Override with API_ORIGIN when the API runs somewhere else.
			'/api': {
				target: process.env.API_ORIGIN ?? 'http://localhost:8080',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
