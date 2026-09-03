// The Standard Ebooks catalogue, flattened to JSON at build time.
//
// paper has no server, so importing a book has to be a plain browser fetch —
// and standardebooks.org is the one open-license source that sends
// `Access-Control-Allow-Origin: *` on the epub file itself. Its *catalogue*,
// though, is a few dozen pages of HTML, which is no thing to make a phone walk.
// So it is walked here instead: once, at build time, where cross-origin rules
// don't apply and the pages cost nothing, and baked into `static/catalog.json`
// for the browse panel to load on demand.
//
// The result is committed, so `bun run dev` and a build with the network down
// both still have a catalogue — just an older one. CI refreshes it before every
// deploy; see .github/workflows/deploy.yaml.
//
//   bun run catalog

const SITE = "https://standardebooks.org";
const PER_PAGE = 48;
/** Far past the real end (~32 pages); only there to bound a broken loop. */
const MAX_PAGES = 200;
const OUT = new URL("../static/catalog.json", import.meta.url);

/** One book, as little of it as the browse panel needs. */
type Entry = {
	/** Path under `/ebooks/`, e.g. `jane-austen/pride-and-prejudice`. */
	slug: string;
	title: string;
	authors: string[];
	/** The cover path's content hash, or "" when the listing had no thumbnail. */
	cover: string;
};

/**
 * The listing is RDFa-annotated and machine-generated, so the shape below is
 * stable enough to read with regexes rather than pulling in a parser: each book
 * is one `<li typeof="schema:Book" about="/ebooks/…">`, and within it the
 * `schema:name` values come in a fixed order — the title first, then one per
 * author.
 */
const BOOK = /<li typeof="schema:Book" about="\/ebooks\/([^"]+)"([\s\S]*?)<\/li>/g;
const NAME = /property="schema:name">([^<]*)</g;
const COVER = /\/images\/covers\/[^/"]+\/([0-9a-f]{8,})\//;

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/** The listing is XHTML, so only the five named refs and numerics can appear. */
function decode(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, ref: string) => {
		if (ref.startsWith("#x") || ref.startsWith("#X"))
			return String.fromCodePoint(parseInt(ref.slice(2), 16));
		if (ref.startsWith("#")) return String.fromCodePoint(Number(ref.slice(1)));
		return ENTITIES[ref] ?? whole;
	});
}

function parse(html: string): Entry[] {
	const entries: Entry[] = [];
	for (const [, slug, body] of html.matchAll(BOOK)) {
		const names = [...body.matchAll(NAME)].map((m) => decode(m[1]).trim());
		// A book with no title is a parse that has drifted, not a book — skip it
		// rather than shipping a nameless card.
		if (!names.length || !names[0]) continue;
		entries.push({
			slug,
			title: names[0],
			authors: names.slice(1).filter(Boolean),
			cover: body.match(COVER)?.[1] ?? "",
		});
	}
	return entries;
}

async function page(n: number): Promise<Entry[]> {
	const res = await fetch(`${SITE}/ebooks?page=${n}&per-page=${PER_PAGE}`, {
		headers: { "user-agent": "paper-catalog (+https://paper.somfic.sh)" },
	});
	if (!res.ok) throw new Error(`page ${n}: HTTP ${res.status}`);
	return parse(await res.text());
}

const books: Entry[] = [];
const seen = new Set<string>();

for (let n = 1; n <= MAX_PAGES; n++) {
	const batch = await page(n);
	// Paging a live listing can show the same book twice if a release lands
	// mid-walk; the slug is the identity, so first sighting wins.
	const fresh = batch.filter((book) => !seen.has(book.slug));
	for (const book of fresh) {
		seen.add(book.slug);
		books.push(book);
	}
	console.log(`page ${n}: ${batch.length} books, ${fresh.length} new (${books.length} total)`);
	// The end of the catalogue, and the only reliable sign of it: asked for a
	// page past the last one, Standard Ebooks redirects back *to* the last page
	// rather than answering 404 or an empty list, so a full page of books we
	// have already seen is what running off the end looks like.
	if (!fresh.length) break;
	// One request every quarter second. Nobody is waiting on this but the build.
	await new Promise((r) => setTimeout(r, 250));
}

// A catalogue this short means the markup moved and the regexes are reading
// nothing; failing here keeps the committed one rather than replacing a working
// catalogue with a broken one.
if (books.length < 100) throw new Error(`only ${books.length} books parsed — has the markup changed?`);

await Bun.write(OUT, JSON.stringify({ source: "standardebooks.org", books }, null, "\t") + "\n");
console.log(`wrote ${books.length} books to static/catalog.json`);
