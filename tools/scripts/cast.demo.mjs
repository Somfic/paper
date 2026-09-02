// A GIF of the character tracker, for a pull request.
//
//   node tools/scripts/cast.demo.mjs [out.gif]
//
// Frames are taken one at a time and assembled by ffmpeg rather than recorded
// as video — see harness/record.mjs for why.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch } from "../harness/app.mjs";
import { recorder } from "../harness/record.mjs";
import { build as buildFixtures } from "../paper/fixtures.mjs";
import { addBook, locate, openBook, turn, waitForCast } from "../paper/reader.mjs";

const out = process.argv.find((a) => a.endsWith(".gif")) ?? "cast.gif";
const books = buildFixtures(mkdtempSync(join(tmpdir(), "paper-fixtures-")));
const app = await launch({
	build: !process.argv.includes("--no-build"),
	cwd: new URL("../..", import.meta.url).pathname,
	viewport: { width: 1000, height: 740 },
});

try {
	const { page } = app;
	await addBook(page, books["paper-en.epub"]);
	await openBook(page, "The Letter");
	await turn(page, 8);
	await waitForCast(page, 1);

	const rec = await recorder(page, { dir: join(tmpdir(), "paper-demo-frames") });
	const name = await locate(page, "Roberts", { band: [120, 420] });

	await rec.say("A dotted underline is someone you have already met");
	await rec.shot(9);
	await rec.point(name.x - 90, name.y + 70);
	await rec.shot(2);
	await rec.point(name.x, name.y);
	await rec.shot(3);

	await rec.say("Tap the name for what the book has said about them");
	await rec.click(name.x, name.y);
	await page.waitForTimeout(500);
	await rec.shot(12);

	await rec.say("Only from the pages you have read — never from further on");
	await rec.shot(10);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	await rec.say("Everyone so far, in the header");
	const cast = await page.locator("header button").nth(2).boundingBox();
	await rec.point(cast.x + cast.width / 2, cast.y + cast.height / 2);
	await rec.shot(2);
	await page.locator("header button").nth(2).click();
	await page.waitForTimeout(600);
	await rec.shot(14);
	await rec.say("");
	await rec.shot(5);

	console.log(`${rec.frames} frames → ${rec.gif(out)}`);
} finally {
	await app.close();
}
