import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".woff2": "font/woff2",
	".epub": "application/epub+zip",
};

/**
 * Serve a built site the way GitHub Pages does: the file if it is there, and
 * otherwise `404.html` *with a 404 status*.
 *
 * That last detail is the reason this exists rather than `vite preview`. A deep
 * link like `/book/1` is a 404 on Pages, and the app's own 404 page is what
 * turns it back into a route — so a dev server that quietly rewrites unknown
 * paths to `index.html` would be testing something the live site never does.
 *
 * Port 0 means the OS picks a free one, so two of these can run at once.
 */
export async function serve(root, port = 0) {
	const server = createServer(async (req, res) => {
		const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
		for (const candidate of [join(root, path), join(root, path, "index.html")]) {
			try {
				const body = await readFile(candidate);
				res.writeHead(200, {
					"content-type": TYPES[extname(candidate)] ?? "application/octet-stream",
				});
				return res.end(body);
			} catch {}
		}
		try {
			const body = await readFile(join(root, "404.html"));
			res.writeHead(404, { "content-type": "text/html" });
			res.end(body);
		} catch {
			res.writeHead(404).end("not found");
		}
	});

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", resolve);
	});

	const actual = server.address().port;
	return {
		port: actual,
		url: `http://localhost:${actual}`,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}
