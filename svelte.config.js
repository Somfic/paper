import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// GitHub Pages serves 404.html for any path it has no file for, so that
		// is where the SPA shell has to live — a deep link like /book/3 boots the
		// app from there. The root still gets a real index.html: see
		// src/routes/+page.ts.
		adapter: adapter({ fallback: '404.html' }),
		paths: {
			base: ''
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) => filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
