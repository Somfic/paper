import { join } from "node:path";
import { chromium } from "playwright-core";
import { devServer, existing, staticSite } from "./site.mjs";

/**
 * Get a site onto a port and open it in Chrome.
 *
 * `playwright-core` and the browser you already have, rather than `playwright`
 * and a downloaded one: the full package's postinstall pulls a few hundred
 * megabytes of browser binaries, which every `bun install` and every CI run
 * would then pay for to support a script that only runs on a laptop.
 *
 * Always `await app.close()` in a `finally` — a leaked Chrome holds the port
 * and the next run will not tell you why it is hanging.
 */
export async function launch({
	// one of these three decides where the site comes from
	url,
	dev,
	root,
	/** `true` for this project's own build command, or a command of your own. */
	build,
	cwd = process.cwd(),
	viewport = { width: 1100, height: 720 },
	quiet = false,
	...rest
} = {}) {
	const site = url
		? existing(url)
		: dev
			? await devServer(dev, { cwd })
			: await staticSite({
					root: root ?? join(cwd, "build"),
					build: build === true ? "bun run build" : build,
					cwd,
					quiet,
				});

	const browser = await chromium.launch({ channel: "chrome" });
	const context = await browser.newContext({ viewport, ...rest });
	const page = await context.newPage();
	await page.goto(site.url);

	return {
		page,
		context,
		browser,
		url: site.url,
		/** Open a second page in the same browser (a second viewport, say). */
		async open(options = {}) {
			const ctx = await browser.newContext({ viewport, ...options });
			const p = await ctx.newPage();
			await p.goto(site.url);
			return p;
		},
		async close() {
			await browser.close().catch(() => {});
			await site.close();
		},
	};
}
