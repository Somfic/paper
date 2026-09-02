import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Recording a demo as a numbered run of screenshots, assembled by ffmpeg.
 *
 * Playwright can record video directly, and it was the first thing tried. Its
 * timing is not linear — the same script trimmed to "the last four seconds"
 * caught a different moment on every run — so the frames are taken one at a
 * time instead, at the moment the script says so. A held beat is the same
 * frame written N times, which is exact and costs nothing.
 *
 * The pointer and the caption are drawn into the page: a real cursor doesn't
 * appear in a screenshot, and a demo without one is a series of things
 * happening for no visible reason.
 */
export async function recorder(page, { dir, keepFrames = false } = {}) {
	const frames = dir ?? join(process.cwd(), ".frames");
	rmSync(frames, { recursive: true, force: true });
	mkdirSync(frames, { recursive: true });

	await page.evaluate(() => {
		const dot = document.createElement("div");
		Object.assign(dot.style, {
			position: "fixed", width: "14px", height: "14px", borderRadius: "50%",
			background: "rgba(20,20,20,.45)", border: "2px solid #fff",
			boxShadow: "0 1px 4px rgba(0,0,0,.4)", zIndex: "2147483647",
			pointerEvents: "none", transform: "translate(-50%,-50%)",
			left: "-100px", top: "-100px", transition: "left .28s ease, top .28s ease",
		});
		const caption = document.createElement("div");
		Object.assign(caption.style, {
			position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)",
			padding: "7px 15px", borderRadius: "999px", background: "rgba(18,18,20,.9)",
			color: "#fff", font: "500 14px/1.3 ui-sans-serif, system-ui, sans-serif",
			zIndex: "2147483647", pointerEvents: "none", opacity: "0",
			transition: "opacity .2s ease", maxWidth: "80vw", textAlign: "center",
		});
		document.body.append(dot, caption);
		window.__demo = {
			cursor: (x, y) => { dot.style.left = `${x}px`; dot.style.top = `${y}px`; },
			say: (t) => { caption.textContent = t ?? ""; caption.style.opacity = t ? "1" : "0"; },
			tap: () => dot.animate(
				[{ transform: "translate(-50%,-50%) scale(1)" },
				 { transform: "translate(-50%,-50%) scale(.55)" },
				 { transform: "translate(-50%,-50%) scale(1)" }],
				{ duration: 300 },
			),
		};
	});

	let n = 0;

	const api = {
		/** Caption the next beat, or pass nothing to clear it. */
		say: (text) => page.evaluate((t) => window.__demo.say(t), text ?? ""),

		/** Move the drawn pointer and the real one together. */
		async point(x, y) {
			await page.evaluate(([x, y]) => window.__demo.cursor(x, y), [x, y]);
			await page.mouse.move(x, y, { steps: 6 });
			await page.waitForTimeout(300);
		},

		async click(x, y) {
			await api.point(x, y);
			await page.evaluate(() => window.__demo.tap());
			await page.mouse.click(x, y);
		},

		/** Take one frame, or hold the moment for `hold` of them. */
		async shot(hold = 1) {
			for (let i = 0; i < hold; i++)
				await page.screenshot({
					path: join(frames, `f${String(n++).padStart(4, "0")}.png`),
				});
		},

		get frames() {
			return n;
		},

		/** Assemble the frames. Needs ffmpeg on PATH. */
		gif(out, { fps = 11, width = 900, colors = 128 } = {}) {
			const filter =
				`scale=${width}:-1:flags=lanczos,split[a][b];` +
				`[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`;
			const run = spawnSync(
				"ffmpeg",
				["-y", "-loglevel", "error", "-framerate", String(fps),
				 "-i", join(frames, "f%04d.png"), "-vf", filter, out],
				{ encoding: "utf8" },
			);
			if (run.error?.code === "ENOENT")
				throw new Error(`ffmpeg is not on PATH — ${n} frames are in ${frames}`);
			if (run.status !== 0) throw new Error(`ffmpeg failed:\n${run.stderr}`);
			if (!keepFrames) rmSync(frames, { recursive: true, force: true });
			return out;
		},
	};

	return api;
}
