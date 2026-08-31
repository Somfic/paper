// Finding the cast of a book with nothing but regexes and a stopword list.
//
// There is no model to ask, so this is unashamedly a heuristic: capitalised
// runs of words that recur, are not sentence-starts in disguise, are not the
// same word the book also uses in lower case, and do not read like places.
// Every rule below is a guess that is right most of the time, and the comments
// say which way each one errs. It runs in a worker (see characters.worker.ts)
// because a whole novel of this work would visibly stall the reader.

import {
	cleanQuote,
	sentences,
	BLOCK_SEP,
	MIN_SECTION_WORDS,
	type CharacterEntry,
	type CharacterMention,
} from "./characters";

export type SectionText = {
	index: number;
	text: string;
	headings: [number, number][];
};

export type ExtractOptions = {
	/** surface forms to never treat as characters — the author's own name */
	exclude?: string[];
};

// ── vocabularies ───────────────────────────────────────────────

// Capitalised words that are never a character: sentence openers, structural
// words from the book's own scaffolding, and the interjections that dialogue is
// made of. A name that collides with one of these is lost, which is why the
// list holds only words that are overwhelmingly not names in English prose.
const STOP = new Set<string>(
	`a about above after again against all almost along already also although
	always am among an and another any anyone anything are around as at away back
	be because been before behind being below beneath beside besides best better
	between beyond both but by came can cannot come could course dear did do does
	doing done down each either else enough even ever every everybody everyone
	everything except far few finally first for forward from get give go going
	gone good got great had half has have having he hell her here hers herself him
	himself his how however i if in indeed inside instead into is it its itself
	just keep last late later least left less let like little long look many may
	maybe me might mine more most much must my myself near neither never
	nevertheless new next no nobody none nor not nothing now of off often oh ok on
	once one only or other others otherwise ought our ours out outside over own
	part perhaps please plenty put quite rather really right said same say see
	seem several shall she should since so some somebody someone something
	sometimes somewhere soon still such sure take than that the their theirs them
	themselves then there therefore these they thing think this those though
	three thus till time to together too took toward towards true try turn two
	under unless until up upon us very want was way we well were what whatever
	when where whether which while who whoever whole whom whose why will with
	within without would yes yet you your yours yourself
	chapter chapters part parts book books prologue epilogue interlude appendix
	acknowledgements acknowledgments contents copyright dedication epigraph
	foreword glossary index introduction preface prologue volume section page
	pages end ends title author about also praise reviews also-by
	monday tuesday wednesday thursday friday saturday sunday january february
	march april may june july august september october november december
	god gods christ jesus lord-god damn damned devil hell heaven
	ah aha alas anyway besides bloody christ eh er ha hey hm hmm huh mm no oh
	okay oops ow please sorry thanks thank true ugh uh um well what why yeah yes
	you-know
	majesty eminence highness excellency grace worship ladyship lordship
	mmm hmmm ahh ohh aah`
		.split(/\s+/)
		.filter(Boolean),
);

// Honorifics and ranks. Stripped off the front of a chunk so that "Inquisitor
// Glokta", "Glokta" and "Sand dan Glokta" collapse into one person, but kept as
// the label the reader most likely remembers.
const TITLES = new Set<string>(
	`mr mrs ms miss master mistress madam madame monsieur dr doctor prof
	professor sir dame lord lady king queen prince princess duke duchess count
	countess baron baroness emperor empress earl marquis viscount
	captain major colonel corporal sergeant sarge general commander admiral
	lieutenant marshal ensign private brigadier
	inquisitor superior practical arch lector magus mage magister crown chancellor
	brother sister father mother uncle aunt cousin grandfather grandmother
	saint st chief president governor judge sheriff reverend rabbi imam pope
	cardinal bishop abbot prior squire knight nurse officer detective agent
	sergeant-major lord-marshal high`
		.split(/\s+/)
		.filter(Boolean),
);

// Lower-case words allowed *inside* a name. "the" is deliberately absent: it
// glues epithets onto names ("Logen the Bloody") and cost more than it bought.
const CONNECTORS = new Set(
	"of de du da di del della dos das van von der den ter le la y dan ibn bin al mac mc".split(
		" ",
	),
);

// "in Adua", "beyond the Whiteflow" — a word that mostly follows one of these
// is a place, not a person.
const LOCATIVE = new Set(
	"in at into near across beyond outside inside around throughout upon onto within atop".split(
		" ",
	),
);

const ARTICLES = new Set(["the", "a", "an"]);

const SPEECH =
	/\b(said|says|asked|replied|answered|muttered|murmured|shouted|snapped|growled|whispered|added|repeated|agreed|continued|called|cried|demanded|observed|remarked|hissed|barked|grunted|sighed|laughed|nodded|shrugged|smiled|frowned)\b/i;

const DESCRIPTIVE =
	/\b(was|were|is|are|had|has|looked|seemed|stood|sat|wore|felt|knew|became|remained|appeared|carried|held)\b/;

// ── tuning ─────────────────────────────────────────────────────

const MAX_CHUNK_WORDS = 4;
const MAX_ENTRIES = 140;
const MAX_QUOTES_PER_ENTRY = 60;
const EARLY_QUOTES = 12; // always keep the first N, so early readers see evidence
const QUOTE_CHARS = 300;

const WORD = /[\p{L}][\p{L}\p{M}'’\-]*/gu;
const isCap = (w: string) => /^\p{Lu}/u.test(w);
const isAllCaps = (w: string) => w.length > 1 && w === w.toLocaleUpperCase();
const norm = (w: string) => w.toLocaleLowerCase().replace(/[’']/g, "'");

type Token = {
	/** the word with any contraction or possessive suffix taken off */
	w: string;
	from: number;
	to: number;
	/** what came off: "’s" is a possessive, "’m" means this was never a name */
	clipped: string;
};

type Occurrence = {
	i: number;
	o: number;
	end: number;
	/** the chunk opened its sentence, so the capital may mean nothing */
	initial: boolean;
	/** honorific that preceded it, if any */
	title?: string;
	/** followed a locative preposition */
	loc: boolean;
	/** followed an article — proper names don't take one, roles and nations do */
	article: boolean;
	/** sits next to a speech verb or a possessive — strong person signal */
	person: boolean;
};

// ── pass one: candidate surface forms ──────────────────────────

// "Glokta’s" is Glokta; "I’m" is I, which is a stopword, which is the point.
const CLIP = /['’](?:s|m|d|t|re|ve|ll)?$|[-'’]+$/i;

function tokenize(text: string, from: number, to: number): Token[] {
	const out: Token[] = [];
	WORD.lastIndex = from;
	for (let m = WORD.exec(text); m && m.index < to; m = WORD.exec(text)) {
		const raw = m[0];
		const cut = CLIP.exec(raw);
		const w = cut ? raw.slice(0, cut.index) : raw;
		if (!w) continue;
		out.push({
			w,
			from: m.index,
			to: m.index + w.length,
			clipped: cut ? cut[0] : "",
		});
	}
	return out;
}

/**
 * Only whitespace between two tokens — a comma or a dash ends the name. A real
 * newline is whitespace here (converted epubs hard-wrap their source); only the
 * synthetic block separator breaks a name in two.
 */
const GLUE = new RegExp(`^[^\\S${BLOCK_SEP}]*$`);
const glued = (text: string, a: Token, b: Token) =>
	GLUE.test(text.slice(a.to, b.from));

type Pass1 = {
	candidates: Map<string, Occurrence[]>;
	/** how often each word appears in lower case anywhere in the book */
	lower: Map<string, number>;
	texts: Map<number, string>;
	spans: Map<number, [number, number][]>;
	words: Map<number, number>;
};

function pass1(sections: SectionText[], exclude: Set<string>): Pass1 {
	const candidates = new Map<string, Occurrence[]>();
	const lower = new Map<string, number>();
	const texts = new Map<number, string>();
	const spans = new Map<number, [number, number][]>();
	const words = new Map<number, number>();

	for (const section of sections) {
		const { text, headings, index } = section;
		texts.set(index, text);
		const sentenceSpans: [number, number][] = [];
		let wordCount = 0;
		const inHeading = (at: number) =>
			headings.some(([a, b]) => at >= a && at < b);

		for (const span of sentences(text)) {
			sentenceSpans.push(span);
			const toks = tokenize(text, span[0], span[1]).filter(
				(t) => !inHeading(t.from),
			);
			wordCount += toks.length;
			for (const t of toks) if (!isCap(t.w)) bump(lower, norm(t.w));

			let k = 0;
			while (k < toks.length) {
				if (!nameable(toks[k].w)) {
					k++;
					continue;
				}
				// Grow the chunk over adjacent capitalised words, hopping the
				// lower-case connectors a name is allowed to contain.
				let end = k;
				let j = k + 1;
				while (j < toks.length && end - k + 1 < MAX_CHUNK_WORDS) {
					const u = toks[j];
					if (nameable(u.w) && glued(text, toks[end], u)) {
						end = j;
						j++;
						continue;
					}
					const next = toks[j + 1];
					if (
						CONNECTORS.has(norm(u.w)) &&
						next &&
						nameable(next.w) &&
						glued(text, toks[end], u) &&
						glued(text, u, next)
					) {
						end = j + 1;
						j += 2;
						continue;
					}
					break;
				}

				const chunk = toks.slice(k, end + 1);
				const possessive = /^['’]s?$/.test(chunk[chunk.length - 1].clipped);

				// Drop the honorifics off the front, and any connector they leave
				// stranded ("Lord Governor of Adua" → "Adua"). A chunk that is
				// nothing but honorifics ("My Lord") is not a name at all.
				let p = 0;
				while (p < chunk.length && TITLES.has(norm(chunk[p].w))) p++;
				const titleWords = p;
				while (p < chunk.length && CONNECTORS.has(norm(chunk[p].w))) p++;
				if (p >= chunk.length) {
					k = end + 1;
					continue;
				}
				const title = titleWords
					? chunk
							.slice(0, titleWords)
							.map((t) => t.w)
							.join(" ")
					: undefined;
				const name = chunk
					.slice(p)
					.map((t) => t.w)
					.join(" ");

				if (!excluded(name, exclude)) {
					const before = toks[k - 1]?.w;
					const after = toks[end + 1]?.w;
					const occ: Occurrence = {
						i: index,
						o: chunk[p].from,
						end: chunk[chunk.length - 1].to,
						initial: k === 0,
						title,
						loc: !!before && LOCATIVE.has(norm(before)),
						article: !!before && ARTICLES.has(norm(before)),
						person:
							possessive ||
							!!title ||
							(!!before && SPEECH.test(before)) ||
							(!!after && SPEECH.test(after)),
					};
					const list = candidates.get(name);
					if (list) list.push(occ);
					else candidates.set(name, [occ]);
				}
				k = end + 1;
			}
		}
		spans.set(index, sentenceSpans);
		words.set(index, wordCount);
	}
	return { candidates, lower, texts, spans, words };
}

const nameable = (w: string) =>
	w.length >= 2 && isCap(w) && !isAllCaps(w) && !STOP.has(norm(w));

const excluded = (name: string, exclude: Set<string>) =>
	name.split(" ").every((w) => exclude.has(norm(w)));

function bump(map: Map<string, number>, key: string) {
	map.set(key, (map.get(key) ?? 0) + 1);
}

// ── pass two: which candidates are people ──────────────────────

function isCharacter(
	name: string,
	occ: Occurrence[],
	p1: Pass1,
	tiny: Set<number>,
): boolean {
	if (occ.length < 2) return false;
	// A word that only ever opens a sentence is usually just a capital letter.
	if (occ.every((o) => o.initial)) return false;
	// Only ever on a title page or in the copyright notice.
	if (occ.every((o) => tiny.has(o.i))) return false;

	const single = !name.includes(" ");
	if (single) {
		// The book also writes this word in lower case, often — so the capital is
		// positional, not a name. Kills "Sun", "Spring", "Fortune".
		const lc = p1.lower.get(norm(name)) ?? 0;
		if (lc >= 3 && lc > occ.length * 0.5) return false;
	}

	// Almost always "the …": a nation, an institution or a role, not a name.
	// The threshold is high on purpose — plenty of characters go by "the
	// Dogman" some of the time.
	if (occ.filter((o) => o.article).length / occ.length >= 0.85) return false;

	const loc = occ.filter((o) => o.loc).length / occ.length;
	const person = occ.filter((o) => o.person).length / occ.length;
	// Reads like somewhere you go rather than someone you meet.
	if (loc >= 0.3 && person < 0.1) return false;
	return true;
}

// ── merging surface forms into one person ──────────────────────

class Union {
	#parent = new Map<string, string>();
	find(x: string): string {
		const p = this.#parent.get(x);
		if (p === undefined || p === x) return x;
		const root = this.find(p);
		this.#parent.set(x, root);
		return root;
	}
	join(a: string, b: string) {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra !== rb) this.#parent.set(ra, rb);
	}
}

/**
 * "Logen" is the same person as "Logen Ninefingers"; "West" is the same person
 * as whichever "… West" the book talks about most. Each bare word is joined to
 * *one* multi-word form only — joining every form that shares a surname would
 * merge a family into one character.
 */
function merge(kept: Map<string, Occurrence[]>): Map<string, string[]> {
	const union = new Union();
	const multi = [...kept.keys()].filter((n) => n.includes(" "));
	for (const [name, occ] of kept) {
		if (name.includes(" ") || occ.length < 2) continue;
		let best: string | null = null;
		let bestCount = 0;
		for (const m of multi) {
			const parts = m.split(" ");
			if (parts[0] !== name && parts[parts.length - 1] !== name) continue;
			const count = kept.get(m)?.length ?? 0;
			if (count > bestCount) {
				best = m;
				bestCount = count;
			}
		}
		if (best) union.join(name, best);
	}
	const groups = new Map<string, string[]>();
	for (const name of kept.keys()) {
		const root = union.find(name);
		const list = groups.get(root);
		if (list) list.push(name);
		else groups.set(root, [name]);
	}
	return groups;
}

/** The label a reader would recognise, out of every form the book used. */
function displayName(
	forms: { name: string; count: number }[],
	titles: Map<string, number>,
	total: number,
): { name: string; aliases: string[] } {
	const sorted = [...forms].sort((a, b) => b.count - a.count);
	const best = sorted[0].name;
	// A full name that is used often enough is the most useful label.
	const full = sorted
		.filter((f) => f.name.includes(" ") && f.count >= total * 0.15)
		.sort((a, b) => b.name.length - a.name.length)[0];
	const topTitle = [...titles.entries()].sort((a, b) => b[1] - a[1])[0];

	let name = best;
	if (full) name = full.name;
	else if (topTitle && topTitle[1] >= total * 0.3)
		name = `${topTitle[0]} ${best}`;

	// Titled forms are matched as one unit so the underline covers "Major West"
	// rather than just "West".
	const aliases = new Set<string>(forms.map((f) => f.name));
	for (const [title, count] of titles)
		if (count >= 2)
			for (const f of forms) aliases.add(`${title} ${f.name}`);
	aliases.add(name);
	return { name, aliases: [...aliases].sort((a, b) => b.length - a.length) };
}

// ── quotes ─────────────────────────────────────────────────────

function sentenceFor(
	spans: [number, number][],
	offset: number,
): [number, number] | null {
	let lo = 0;
	let hi = spans.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [a, b] = spans[mid];
		if (offset < a) hi = mid - 1;
		else if (offset >= b) lo = mid + 1;
		else return spans[mid];
	}
	return null;
}

/**
 * How much a sentence tells you about someone. Attribution ("'Fine,' said
 * Glokta") scores badly; apposition and description score well. Deliberately
 * crude — it only has to rank, not understand.
 */
export function scoreQuote(sentence: string, name: string): number {
	const last = name.split(" ").pop() ?? name;
	const esc = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	let score = 0;
	const len = sentence.length;
	if (len >= 60 && len <= 240) score += 2;
	if (len < 40) score -= 3;
	if (len > 320) score -= 2;
	if (SPEECH.test(sentence)) score -= 3;
	if (/^[“"'‘]/.test(sentence)) score -= 1;
	if (new RegExp(`${esc}\\s*,\\s*(the|a|an|who|once|formerly|his|her)\\b`).test(sentence))
		score += 5;
	if (new RegExp(`${esc}(?:['’]s)?\\s+${DESCRIPTIVE.source}`).test(sentence))
		score += 3;
	const caps = sentence.match(/(?<=[a-z,;:]\s)\p{Lu}\p{Ll}+/gu)?.length ?? 0;
	if (caps > 2) score -= caps - 2;
	return score;
}

const truncate = (s: string) =>
	s.length <= QUOTE_CHARS ? s : `${s.slice(0, QUOTE_CHARS - 1).trimEnd()}…`;

// ── the whole thing ────────────────────────────────────────────

export function extract(
	sections: SectionText[],
	options: ExtractOptions = {},
): CharacterEntry[] {
	const exclude = new Set((options.exclude ?? []).map(norm));
	const p1 = pass1(sections, exclude);

	const tiny = new Set<number>();
	for (const [index, count] of p1.words)
		if (count < MIN_SECTION_WORDS) tiny.add(index);

	const kept = new Map<string, Occurrence[]>();
	for (const [name, occ] of p1.candidates)
		if (isCharacter(name, occ, p1, tiny)) kept.set(name, occ);

	const groups = merge(kept);

	type Draft = {
		name: string;
		aliases: string[];
		occ: Occurrence[];
	};
	const drafts: Draft[] = [];

	for (const forms of groups.values()) {
		const all: Occurrence[] = [];
		const titles = new Map<string, number>();
		const counts: { name: string; count: number }[] = [];
		for (const form of forms) {
			const occ = kept.get(form) ?? [];
			counts.push({ name: form, count: occ.length });
			for (const o of occ) {
				all.push(o);
				if (o.title) bump(titles, o.title);
			}
		}
		// One mention can be picked up by two forms ("Glokta" inside "Sand dan
		// Glokta" never is, but overlapping chunks can happen at a seam) — keep
		// the longest span at each position.
		all.sort((a, b) => a.i - b.i || a.o - b.o || b.end - a.end);
		const occ: Occurrence[] = [];
		for (const o of all) {
			const prev = occ[occ.length - 1];
			if (prev && prev.i === o.i && o.o < prev.end) continue;
			occ.push(o);
		}

		const hasFull = counts.some((c) => c.name.includes(" "));
		const titled = titles.size > 0;
		// Two sightings is enough for someone the book gives a full name or a
		// rank; a bare capitalised word needs three before we believe it.
		if (occ.length < (hasFull || titled ? 2 : 3)) continue;

		const { name, aliases } = displayName(counts, titles, occ.length);
		drafts.push({ name, aliases, occ });
	}

	drafts.sort((a, b) => b.occ.length - a.occ.length);
	const top = drafts.slice(0, MAX_ENTRIES);

	// An alias may look like it belongs to two people ("West" as a bare word vs.
	// "Ardee West"); give it to the one the book mentions more, so a tap in the
	// text resolves to exactly one entry.
	const claimed = new Set<string>();
	const entries: CharacterEntry[] = [];
	for (const draft of top) {
		const aliases = draft.aliases.filter((a) => {
			const key = a.replace(/\s+/g, " ");
			if (claimed.has(key)) return false;
			claimed.add(key);
			return true;
		});
		if (!aliases.length) continue;

		const mentions: CharacterMention[] = draft.occ.map((o) => ({
			i: o.i,
			o: o.o,
		}));
		// Score every mention's sentence, then keep the text of the earliest
		// handful (so a reader ten pages in has something) plus the most
		// descriptive ones (so a reader at the end has the good ones).
		const quotes = draft.occ.map((o) => {
			const spans = p1.spans.get(o.i);
			const text = p1.texts.get(o.i);
			if (!spans || !text) return null;
			const span = sentenceFor(spans, o.o);
			if (!span) return null;
			const quote = truncate(cleanQuote(text.slice(span[0], span[1])));
			return { quote, score: scoreQuote(quote, draft.name) };
		});

		const keep = new Set<number>();
		for (let k = 0; k < Math.min(EARLY_QUOTES, quotes.length); k++) keep.add(k);
		const ranked = quotes
			.map((q, k) => ({ k, score: q?.score ?? -99 }))
			.sort((a, b) => b.score - a.score);
		for (const { k, score } of ranked) {
			if (keep.size >= MAX_QUOTES_PER_ENTRY) break;
			if (score >= 2) keep.add(k);
		}
		const seen = new Set<string>();
		for (const k of [...keep].sort((a, b) => a - b)) {
			const q = quotes[k];
			if (!q || seen.has(q.quote)) continue;
			seen.add(q.quote);
			mentions[k].t = q.quote;
			mentions[k].q = q.score;
		}

		entries.push({ name: draft.name, aliases, mentions });
	}
	return entries;
}
