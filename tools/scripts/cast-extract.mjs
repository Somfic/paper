// The character scan, run over an epub without a browser.
//
//   bun tools/scripts/cast-extract.mjs [book.epub …]
//
// bun rather than node, because it imports the extractor's TypeScript straight
// from src/ — which is the point: a change to the heuristics can be judged in a
// second, against a real book, with no build and no browser.
//
// The flattening out here is a regex stand-in for the real one (see
// paper/epub.mjs), so treat a surprise as a lead and confirm it in the browser.

import { basename } from "node:path";
import { extract } from "../../src/lib/reader/characters-extract.ts";
import { build as buildFixtures } from "../paper/fixtures.mjs";
import { sectionsOf } from "../paper/epub.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let books = process.argv.slice(2).filter((a) => a.endsWith(".epub"));
if (!books.length) {
	const dir = mkdtempSync(join(tmpdir(), "paper-fixtures-"));
	books = Object.values(buildFixtures(dir));
	console.log("no books given — using the fixtures\n");
}

for (const path of books) {
	const book = sectionsOf(path);
	const words = book.sections.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
	console.log(
		`${basename(path)}  —  ${book.title || "untitled"} · ${book.language ?? "no language"} · ` +
			`${book.sections.length} sections · ${words.toLocaleString()} words`,
	);

	const started = performance.now();
	const entries = extract(book.sections, {
		// The author's own name is on the title page and in the copyright notice,
		// and is not a character.
		exclude: book.author.split(/[\s,]+/).filter(Boolean),
		language: book.language,
	});
	const took = Math.round(performance.now() - started);

	for (const entry of entries.slice(0, 30)) {
		const aliases = entry.aliases.filter((a) => a !== entry.name);
		console.log(
			`  ${String(entry.mentions.length).padStart(5)}  ${entry.name.padEnd(26)}` +
				(aliases.length ? `also: ${aliases.join(", ")}` : ""),
		);
	}
	if (entries.length > 30) console.log(`  … and ${entries.length - 30} more`);
	console.log(`  ${entries.length} in the cast, in ${took}ms\n`);
}
