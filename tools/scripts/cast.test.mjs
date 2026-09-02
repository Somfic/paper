// The character tracker, end to end in a browser against the built site.
//
//   node tools/scripts/cast.test.mjs            # builds first
//   node tools/scripts/cast.test.mjs --no-build
//
// Every assertion here is a property of the feature rather than of the fixture,
// so the same script keeps working as the heuristics change.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { launch } from "../harness/app.mjs";
import { checks } from "../harness/check.mjs";
import { build as buildFixtures } from "../paper/fixtures.mjs";
import {
	addBook,
	forgetPosition,
	locate,
	openBook,
	turn,
	waitForCast,
} from "../paper/reader.mjs";

const books = buildFixtures(mkdtempSync(join(tmpdir(), "paper-fixtures-")));
const t = checks("character tracker");
const repo = new URL("../..", import.meta.url).pathname;
const app = await launch({
	build: !process.argv.includes("--no-build"),
	cwd: repo,
});
t.watch(app.page);
const { page } = app;

try {
	// ── the Dutch book: stopwords are not people ──────────────────
	await addBook(page, books["paper-nl.epub"]);
	await openBook(page);
	await turn(page, 8);
	const nl = await waitForCast(page, 1);
	const names = (nl?.entries ?? []).map((e) => e.name);
	t.ok("Dutch book produced a cast", names.length >= 3);
	t.ok(
		`no Dutch function words in it (${names.join(", ")})`,
		!names.some((n) => ["Ja", "Nee", "Waarom", "Papa"].includes(n)),
	);
	const michel = nl?.entries.find((e) => e.name === "Michel");
	t.ok("the genitive folded into the name", !!michel?.aliases.includes("Michels"));
	t.ok(
		"nobody swallowed the genitive as a surname",
		!names.some((n) => n.endsWith(" Michels")),
	);

	// ── the page itself ───────────────────────────────────────────
	const underlines = await page.evaluate(() => {
		const doc = document.querySelector("foliate-view")?.renderer?.getContents?.()?.[0];
		return doc?.overlayer?.element?.querySelectorAll?.("g").length ?? 0;
	});
	t.ok(`names are underlined on the page (${underlines})`, underlines > 0);

	const at = await locate(page, "Michel");
	t.ok("a name is findable on screen", !!at);
	await page.mouse.click(at.x, at.y);
	await page.waitForTimeout(800);
	const card = page.locator('[role="dialog"][aria-label^="About"]');
	t.ok("tapping a name opens its card", (await card.count()) === 1);
	t.ok(
		"the card quotes the book back",
		(await card.innerText()).includes("mentions so far"),
	);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(300);

	// ── spoiler safety: the cast grows as you read ────────────────
	const rows = async () => {
		await page.locator("header button").nth(2).click();
		await page.waitForTimeout(600);
		const n = await page.locator('[aria-label="Cast so far"] li').count();
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);
		return n;
	};
	const deep = await rows();
	await page.goto(app.url);
	await forgetPosition(page, 1);
	await openBook(page, "De Brief van Michel");
	await page.waitForTimeout(1500);
	const atStart = await rows();
	t.ok(`the cast grows as you read (${atStart} → ${deep})`, atStart < deep);

	// ── the English book: its genitive is a different animal ──────
	await page.goto(app.url);
	await addBook(page, books["paper-en.epub"]);
	await openBook(page, "The Letter");
	await turn(page, 8);
	const en = await waitForCast(page, 2);
	const enNames = (en?.entries ?? []).map((e) => e.name);
	t.ok(`English book produced a cast (${enNames.join(", ")})`, enNames.length >= 3);
	t.ok(
		"Robert and Roberts stayed two people",
		enNames.includes("Robert") && enNames.some((n) => n.includes("Roberts")),
	);
	t.ok(
		"the apostrophe possessive folded away",
		!enNames.some((n) => n.includes("’") || n.includes("'")),
	);
} finally {
	await app.close();
}

t.done();
