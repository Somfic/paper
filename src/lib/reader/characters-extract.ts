// Finding the cast of a book with nothing but regexes and a stopword list.
//
// There is no model to ask, so this is unashamedly a heuristic: capitalised
// runs of words that recur, are not sentence-starts in disguise, are not the
// same word the book also uses in lower case, and do not read like places.
// Every rule below is a guess that is right most of the time, and the comments
// say which way each one errs. It runs in a worker (see characters.worker.ts)
// because a whole novel of this work would visibly stall the reader.
//
// All of that is a way of ruling candidates *out*, and on its own it produced a
// gazetteer rather than a cast: London, Bukovina, the Slovaks and the Magyars
// trip none of it. So the last word belongs to one rule that asks for evidence
// *for* a person — the three things prose does to people and to nothing else,
// which are to let them own something, to give them an honorific, and to put
// them next to a speech verb. See the person test at the end of `extract`.

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
	/** the book's own `dc:language`, if it declares one */
	language?: string;
};

// ── vocabularies ───────────────────────────────────────────────

// Capitalised words that are never a character: sentence openers, structural
// words from the book's own scaffolding, and the interjections that dialogue is
// made of. A name that collides with one of these is lost, which is why the
// list holds only words that are overwhelmingly not names in English prose.
/** A whitespace-separated vocabulary, written as prose in the source. */
const words = (source: string) =>
	new Set<string>(source.split(/\s+/).filter(Boolean));

const STOP = words(
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
	you-know aye nay lor blimey gawd hush hark
	majesty eminence highness excellency grace worship ladyship lordship
	mmm hmmm ahh ohh aah`,
);

// Everything above is English. A Dutch novel's function words are a different
// set entirely, and without them the tracker offers "Ja", "Waarom", "Nee" and
// "Papa" as members of the cast — which is what a reader of a Dutch book
// actually got. The English list stays in force whatever the language: it
// costs a Dutch book nothing, and an epub's own scaffolding is in English more
// often than the book is.
//
// A few of these are also Dutch given names ("Wil", "Mei", "Dan"). They are in
// the list anyway: a book that uses the word constantly in lower case already
// loses the name to the lower-case rule below, so the entry changes nothing.
const STOP_BY_LANGUAGE: Record<string, Set<string>> = {
	nl: words(`
		de het een en van dat die dit deze der den des te in op aan met voor door
		over onder tussen naar uit bij om als dan toen nu nog al ook maar want dus
		of niet geen wel zo zeer heel erg meer meest minder weinig veel alle alles
		allemaal iets niets iemand niemand elk elke ieder iedere iedereen zelf
		zelfde hetzelfde dezelfde ander andere anders beide beiden samen
		ik jij je jou u hij zij ze wij we jullie mij me hem haar hen hun ons onze
		mijn jouw uw zich zichzelf elkaar men
		ben bent is zijn was waren geweest word wordt worden werd werden geworden
		heb hebt heeft hebben had hadden gehad kan kun kunt kunnen kon konden
		zal zult zullen zou zouden mag mag magen mogen mocht mochten moet moeten
		moest moesten wil wilt willen wilde wilden wou doe doet doen deed deden
		gedaan ga gaat gaan ging gingen gegaan kom komt komen kwam kwamen gekomen
		zei zegt zeggen zeiden gezegd vroeg vraagt vragen keek kijkt kijken staat
		staan stond stonden zit zitten zat zaten liep lopen dacht denken wist
		weten werd blijft blijven bleef
		wat wie waar wanneer waarom hoe welke welk hoeveel waarheen waarvan
		ja nee jawel nou goed oke okee hoor ach och oh hm hmm haha zeg kijk
		luister alsjeblieft alstublieft dank dankje bedankt sorry helaas
		natuurlijk misschien echt eigenlijk gewoon even nooit altijd soms vaak
		weer opnieuw eerst laatst later eerder straks meteen ineens plotseling
		vandaag gisteren morgen avond ochtend nacht middag jaar week maand uur
		papa mama pap mam vader moeder ouders opa oma pa ma oom tante broer zus
		zusje broertje jongen meisje man vrouw kind kinderen mens mensen meneer
		mevrouw mijnheer juffrouw
		hoofdstuk deel proloog epiloog inhoud voorwoord nawoord bijlage register
		titel auteur uitgeverij uitgave druk bladzijde einde
		maandag dinsdag woensdag donderdag vrijdag zaterdag zondag januari
		februari maart april mei juni juli augustus september oktober november
		december
		god heer here hemel hel duivel jezus christus lieve verdomme
	`),
};

/**
 * Function words that are common in one language and rare in the others. This
 * only ever *adds* a stopword list, so a wrong guess costs a name and a missed
 * guess costs nothing — hence the generous threshold in `sniff`.
 */
const MARKERS: Record<string, string[]> = {
	// No word here may be common in the other language: "was" is both English
	// and Dutch and so is not a marker for either, and "in", "is" and "of" are
	// out for the same reason.
	en: `the and that with have this from they their which would about been what
		there could should her his him she said`
		.split(/\s+/)
		.filter(Boolean),
	nl: `de het een van dat die niet zijn hij ze naar maar ook nog toen werd
		deze zich hebben worden`
		.split(/\s+/)
		.filter(Boolean),
};

/** Languages that write the genitive as a bare s: "Michels jas" is Michel's. */
const GENITIVE_S = new Set(["nl", "af", "de", "da", "sv", "nb", "nn", "no"]);

/** Enough of the book to tell what it is written in, without reading all of it. */
const SNIFF_CHARS = 200_000;
/** Share of a sample's words that have to be a language's markers to count. */
const MARKER_SHARE = 0.05;

/** Every language the book reads as, by the markers its words match. */
function sniff(sections: SectionText[]): string[] {
	let sample = "";
	for (const section of sections) {
		sample += section.text.slice(0, SNIFF_CHARS - sample.length);
		if (sample.length >= SNIFF_CHARS) break;
	}
	const counts = new Map<string, number>();
	let total = 0;
	WORD.lastIndex = 0;
	for (let m = WORD.exec(sample); m; m = WORD.exec(sample)) {
		total++;
		bump(counts, norm(m[0]));
	}
	if (total < 200) return [];
	const out: string[] = [];
	for (const [lang, markers] of Object.entries(MARKERS)) {
		let hits = 0;
		for (const marker of markers) hits += counts.get(marker) ?? 0;
		if (hits / total >= MARKER_SHARE) out.push(lang);
	}
	return out;
}

/**
 * The languages a book is in: what it reads as, plus what it says it is. The
 * declaration is dropped when the prose plainly contradicts it — epubs are
 * mislabelled often enough that the text is the better witness — and kept when
 * there is nothing here to check it against, which is how a German book still
 * gets its genitives undone without a German marker list.
 */
function languagesOf(sections: SectionText[], declared?: string): Set<string> {
	const read = sniff(sections);
	const langs = new Set(read);
	const tag = (declared ?? "").toLowerCase().split(/[-_]/)[0];
	if (tag && (!read.length || read.includes(tag))) langs.add(tag);
	return langs;
}

// Honorifics and ranks. Stripped off the front of a chunk so that "Inquisitor
// Glokta", "Glokta" and "Sand dan Glokta" collapse into one person, but kept as
// the label the reader most likely remembers.
const TITLES = words(
	`mr mrs ms miss master mistress madam madame monsieur dr doctor prof
	professor sir dame lord lady king queen prince princess duke duchess count
	countess baron baroness emperor empress earl marquis viscount
	captain major colonel corporal sergeant sarge general commander admiral
	lieutenant marshal ensign private brigadier
	inquisitor superior practical arch lector magus mage magister crown chancellor
	brother sister father mother uncle aunt cousin grandfather grandmother
	saint st chief president governor judge sheriff reverend rabbi imam pope
	cardinal bishop abbot prior squire knight nurse officer detective agent
	sergeant-major lord-marshal high
	meneer mevrouw mijnheer mevr dhr juffrouw juf dokter dominee pastoor
	koning koningin prins prinses graaf gravin hertog hertogin ridder
	kapitein luitenant kolonel sergeant generaal agent rechercheur meester
	broeder zuster pater
	herr frau fraulein fräulein signor signora signorina senor señor senora
	señora senorita señorita don doña dona sahib effendi pasha bey khan`,
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

// Generic nouns that a place name ends with. Checked only as the *last* word
// of a name of two or more words, which is what makes it safe: "Gracechurch
// Street" and "Camden Town" go, and the housekeeper called Hill stays. Places
// are the one false positive that earns person evidence honestly — a letter is
// addressed from Regent Street, so somebody said it — and this is the shape
// they nearly all take.
const PLACE_TAIL = words(
	`street st road lane avenue drive way square place park gardens green
	terrace court close row crescent quay wharf embankment
	house hall lodge cottage manor grange abbey priory castle keep tower
	farm mill inn tavern arms church chapel cathedral school college hospital
	prison asylum station harbour port docks
	bay cape point island isle lake river creek brook valley dale moor fell
	wood woods forest common heath marsh field fields hill hills mount mountain
	town city village borough county shire province parish district`,
);

// Verbs that attribute speech. Standing next to one is, along with a
// possessive and an honorific, the entire evidence that a capitalised word is
// a person rather than a place — see the person test in `extract` — so this is
// per language rather than English-only. A Dutch novel whose dialogue is all
// "zei" and "vroeg" would otherwise have no person evidence anywhere in it,
// and no cast at all.
const SPEECH_BY_LANGUAGE: Record<string, string> = {
	en: `said says say asked asks replied answered muttered murmured shouted
		snapped growled whispered added repeated agreed continued called cried
		demanded observed remarked hissed barked grunted sighed laughed nodded
		shrugged smiled frowned told tells`,
	nl: `zei zeg zegt zeggen zeiden gezegd vroeg vraag vraagt vroegen gevraagd
		antwoordde antwoordt antwoorden riep roept riepen schreeuwde fluisterde
		mompelde stamelde bromde gromde siste snauwde herhaalde vervolgde
		beaamde knikte zuchtte lachte glimlachte grinnikte hijgde vertelde`,
};

/** One matcher over the speech verbs of every language the book reads as. */
function speechVerbs(languages: Iterable<string>): RegExp {
	const all = new Set<string>();
	// English stays in force whatever the language, for the same reason its
	// stopwords do: an epub's own scaffolding is in English more often than not.
	for (const lang of ["en", ...languages])
		for (const verb of (SPEECH_BY_LANGUAGE[lang] ?? "").split(/\s+/))
			if (verb) all.add(verb);
	return new RegExp(`^(?:${[...all].join("|")})$`, "i");
}

/** English only, and only for ranking quotes — see `scoreQuote`. */
const SPEECH = new RegExp(
	`\\b(?:${SPEECH_BY_LANGUAGE.en.split(/\s+/).filter(Boolean).join("|")})\\b`,
	"i",
);

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
	/** offset of the chunk's final word — where a genitive s would be */
	last: number;
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
	/** how often each word appears capitalised, and how it was first spelled */
	caps: Map<string, number>;
	spelling: Map<string, string>;
	texts: Map<number, string>;
	spans: Map<number, [number, number][]>;
	words: Map<number, number>;
};

function pass1(
	sections: SectionText[],
	exclude: Set<string>,
	stop: Set<string>,
	speech: RegExp,
): Pass1 {
	const candidates = new Map<string, Occurrence[]>();
	const lower = new Map<string, number>();
	const caps = new Map<string, number>();
	const spelling = new Map<string, string>();
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
			for (const t of toks)
				if (isCap(t.w)) {
					bump(caps, norm(t.w));
					if (!spelling.has(norm(t.w))) spelling.set(norm(t.w), t.w);
				} else bump(lower, norm(t.w));

			let k = 0;
			while (k < toks.length) {
				if (!nameable(toks[k].w, stop)) {
					k++;
					continue;
				}
				// Grow the chunk over adjacent capitalised words, hopping the
				// lower-case connectors a name is allowed to contain.
				let end = k;
				let j = k + 1;
				while (j < toks.length && end - k + 1 < MAX_CHUNK_WORDS) {
					const u = toks[j];
					if (nameable(u.w, stop) && glued(text, toks[end], u)) {
						end = j;
						j++;
						continue;
					}
					const next = toks[j + 1];
					if (
						CONNECTORS.has(norm(u.w)) &&
						next &&
						nameable(next.w, stop) &&
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
				// Only the stranding case: a connector at the very front of a chunk
				// is the beginning of the surname, not a joiner, since the joiners
				// English uses that way ("of", "the") are stopwords a chunk cannot
				// open with. Stripping it unconditionally made Van Helsing "Helsing"
				// and left the "Van" on the page with no underline under it.
				if (titleWords)
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
						last: chunk[chunk.length - 1].from,
						initial: k === 0,
						title,
						loc: !!before && LOCATIVE.has(norm(before)),
						article: !!before && ARTICLES.has(norm(before)),
						person:
							possessive ||
							!!title ||
							(!!before && speech.test(before)) ||
							(!!after && speech.test(after)),
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
	return { candidates, lower, caps, spelling, texts, spans, words };
}

const nameable = (w: string, stop: Set<string>) =>
	w.length >= 2 && isCap(w) && !isAllCaps(w) && !stop.has(norm(w));

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

	const parts = name.split(" ");
	// An address, not a person — see PLACE_TAIL.
	if (parts.length > 1 && PLACE_TAIL.has(norm(parts[parts.length - 1])))
		return false;

	const single = parts.length === 1;
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

/**
 * "the Lucases", "the Bennets", "the Slovaks" — a family or a people, and not
 * anyone the reader can be introduced to. They pass every other test here
 * because they behave exactly like the name they are built from.
 *
 * The test is two-sided on purpose, because plenty of real surnames end in s:
 * the word has to be some *other* name the book uses, with a plural stuck on
 * the end, *and* the book has to keep putting "the" in front of it. "Jones"
 * fails the first ("Jone" is nobody) and "Collins" the second, so both keep
 * their place in the cast.
 */
function isGroup(name: string, occ: Occurrence[], p1: Pass1): boolean {
	const last = norm(name.split(" ").pop() ?? "");
	const stems = [
		last.endsWith("es") ? last.slice(0, -2) : "",
		last.endsWith("s") ? last.slice(0, -1) : "",
	];
	if (!stems.some((s) => s.length >= 3 && (p1.caps.get(s) ?? 0) >= 2)) return false;
	return occ.filter((o) => o.article).length / occ.length >= 0.4;
}

// ── the genitive s ─────────────────────────────────────────────

/**
 * Dutch — and German, and the Scandinavian languages — writes the genitive by
 * sticking an s on the end with no apostrophe: "Michels jas" is Michel's coat.
 * Left alone the scan reads "Michels" as a second person, and worse, glues it
 * to whoever happens to stand next to it: "Anna Michels oude rapport" becomes a
 * character called "Anna Michels". Both come from the same mistake, so both are
 * fixed in one place — a capitalised word that is some other name plus an s is
 * that name in the genitive, and it always begins a name of its own.
 *
 * English needs none of this (its genitive carries an apostrophe, which the
 * tokenizer already clips) and must not have it: "Roberts" and "Robert" are two
 * different people often enough to matter. Hence the language gate.
 *
 * Returns, per canonical name, the genitive forms that were folded into it, so
 * the reader still gets "Michels" underlined in the text.
 */
function undoGenitives(p1: Pass1): Map<string, Set<string>> {
	const extra = new Map<string, Set<string>>();

	/** The name this word is the genitive of, spelled as the book spells it. */
	const stemOf = (word: string): string | null => {
		const n = norm(word);
		// "Hans'" and "Anna's" lose their suffix in the tokenizer already; this
		// is only the bare-s form, and only when the stem is a name in its own
		// right that the book uses at least as often.
		if (n.length < 4 || !n.endsWith("s")) return null;
		const stem = n.slice(0, -1);
		const count = p1.caps.get(stem) ?? 0;
		if (count < 2 || count * 2 < (p1.caps.get(n) ?? 0)) return null;
		return p1.spelling.get(stem) ?? null;
	};

	const add = (name: string, occ: Occurrence) => {
		const list = p1.candidates.get(name);
		if (list) list.push(occ);
		else p1.candidates.set(name, [occ]);
	};

	for (const [name, occs] of [...p1.candidates]) {
		const parts = name.split(" ");
		const stem = stemOf(parts[parts.length - 1]);
		if (!stem) continue;
		p1.candidates.delete(name);

		const head = parts.slice(0, -1).join(" ");
		for (const occ of occs) {
			// A possessive is about as strong a sign of a person as prose gives.
			add(stem, {
				...occ,
				title: undefined,
				o: head ? occ.last : occ.o,
				end: occ.end - 1,
				last: head ? occ.last : occ.o,
				initial: head ? false : occ.initial,
				loc: false,
				article: false,
				person: true,
			});
			// Whatever stood in front of the genitive was a name of its own that
			// the chunker swallowed; give it its occurrence back.
			if (head)
				add(head, {
					...occ,
					end: occ.last,
					last: occ.o,
					person: false,
				});
		}

		const forms = extra.get(stem) ?? new Set<string>();
		forms.add(parts[parts.length - 1]);
		extra.set(stem, forms);
	}
	return extra;
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
	const languages = languagesOf(sections, options.language);
	const stop = new Set(STOP);
	for (const lang of languages)
		for (const word of STOP_BY_LANGUAGE[lang] ?? []) stop.add(word);

	const p1 = pass1(sections, exclude, stop, speechVerbs(languages));
	const genitives = [...languages].some((l) => GENITIVE_S.has(l))
		? undoGenitives(p1)
		: new Map<string, Set<string>>();

	const tiny = new Set<number>();
	for (const [index, count] of p1.words)
		if (count < MIN_SECTION_WORDS) tiny.add(index);

	const kept = new Map<string, Occurrence[]>();
	for (const [name, occ] of p1.candidates)
		if (isCharacter(name, occ, p1, tiny) && !isGroup(name, occ, p1))
			kept.set(name, occ);

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

		// The one rule that asks for evidence *for* a person rather than against
		// one, and the only thing that separates a cast from a gazetteer. Every
		// other test here is a way of ruling a candidate out, and a place name
		// trips none of them: "London", "Bukovina" and "the Slovaks" are
		// capitalised every time, recur, never appear in lower case and are not
		// always preceded by "the" — so they walked straight into the cast of
		// Dracula. What they never do is the three things prose does to a person
		// and to nothing else: own something ("Mina's"), carry an honorific
		// ("Count Dracula") or stand next to a speech verb ("said Van Helsing").
		//
		// Measured over the whole of Dracula, every real character clears this
		// and every place, people and language in the book scores exactly zero.
		// It is asked of the *merged* person, so "Jonathan" is carried by the
		// possessives on "Jonathan Harker", and it errs towards dropping a walk-on
		// who is never quoted, never titled and never owns anything — which is
		// about as close to not being in the book as a character gets.
		const person = occ.filter((o) => o.person).length;
		// One neighbour out of fifty is a coincidence; one out of three is all a
		// minor character is ever going to get.
		if (person < (occ.length >= 12 ? 2 : 1)) continue;

		const { name, aliases } = displayName(counts, titles, occ.length);
		// The genitive forms were never candidates of their own, but the reader
		// still meets "Michels" on the page and should see it underlined.
		for (const form of forms)
			for (const genitive of genitives.get(form) ?? []) aliases.push(genitive);
		drafts.push({
			name,
			aliases: [...new Set(aliases)].sort((a, b) => b.length - a.length),
			occ,
		});
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
