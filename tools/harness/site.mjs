import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Getting the thing under test onto a port. Three shapes, because a static
 * build and a dev server want opposite treatment and sometimes there is
 * already a server running that you just want to point at.
 */

/** Point at something already running. */
export function existing(url) {
	return { url, close: async () => {} };
}

/**
 * Run a dev server and wait for it to say where it is. `ready` has to capture
 * the URL, because the port is usually chosen by the tool, not by us.
 */
export function devServer(command, {
	cwd = process.cwd(),
	ready = /(https?:\/\/localhost:\d+)/,
	timeout = 60000,
} = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
		let output = "";
		const done = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(`dev server never printed a URL in ${timeout}ms:\n${output}`));
		}, timeout);

		const read = (chunk) => {
			output += chunk;
			const match = ready.exec(output);
			if (!match) return;
			clearTimeout(done);
			resolve({
				url: match[1] ?? match[0],
				close: async () => {
					child.kill("SIGTERM");
					await new Promise((r) => child.once("exit", r));
				},
			});
		};
		child.stdout.on("data", read);
		child.stderr.on("data", read);
		child.once("error", reject);
	});
}

/**
 * Build a static site and serve it the way GitHub Pages would. See
 * `server.mjs` for why that is not the same as `vite preview`.
 */
export async function staticSite({ root, build, cwd = process.cwd(), quiet = false }) {
	if (build) {
		if (!quiet) process.stdout.write(`${build}… `);
		const out = spawnSync(build, { cwd, shell: true, encoding: "utf8" });
		if (out.status !== 0) throw new Error(`build failed:\n${out.stderr || out.stdout}`);
		if (!quiet) console.log("done");
	}
	if (!existsSync(root)) throw new Error(`nothing built at ${root}`);
	const { serve } = await import("./server.mjs");
	return serve(root);
}
