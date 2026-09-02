import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { proseFrom, writeEpub } from "./epub.mjs";

// Books to test against. Real prose rather than word salad, because every
// heuristic in the character scan reads sentence shape: where the capitals
// fall, what follows a preposition, which words the book also writes in lower
// case. A fixture of random nouns exercises none of it.

/**
 * Dutch. The sentences that matter are the ones where a function word carries
 * a capital *mid-sentence* — `zei: "Ja, …"` — because that is the shape that
 * makes the scan believe it has found a name. Also carries the apostrophe-less
 * genitive ("Michels jas"), including the case where it stands next to another
 * name and the chunker tries to swallow both ("Anna Michels oude rapport").
 */
export const DUTCH = [
	'Michel keek uit het raam en zei: "Ja, het regent weer."',
	'Anna schudde haar hoofd en vroeg: "Waarom heb je dat niet eerder gezegd?"',
	"Toen kwam Papa binnen met een stapel kranten onder zijn arm.",
	"Michels jas hing nog altijd aan de kapstok bij de voordeur.",
	"Joris Bakker woonde al dertig jaar in hetzelfde huis aan de gracht.",
	'Sanne lachte en antwoordde: "Ja, dat dacht ik ook al."',
	"Papa zette de radio aan en luisterde naar het nieuws van zes uur.",
	"Anna dacht aan de zomer waarin Michel voor het eerst bij hen kwam eten.",
	"Hij begreep niet waarom Michels vader nooit iets over de oorlog vertelde.",
	"Michel dacht na over de vraag en wist niet goed wat hij moest antwoorden.",
	"Meneer Bakker knikte langzaam en zei niets meer over de brief.",
	'Sanne vroeg zich hardop af: "Waarom zou hij daar nu nog heen gaan?"',
	"Michel liep de trap af en hoorde Papa in de keuken rommelen.",
	"De brief lag drie dagen ongeopend op de tafel in de gang.",
	"Anna zette thee en sneed het brood dat Papa had meegebracht.",
	'Joris keek naar Michel en zei: "Ja, dat is precies wat ik bedoel."',
	"Michels handschrift was klein en scheef, bijna niet te lezen.",
	"Het huis rook naar natte wol en naar de koffie van de ochtend.",
	"Sanne en Anna praatten tot ver na middernacht over hun moeder.",
	"Papa had de foto bewaard in een la die nooit helemaal dichtging.",
	"Michel wist niet wat hij moest zeggen en zweeg dus maar.",
	"Zij vroeg zich af waarom Joris zo weinig over zijn zoon sprak.",
	"De trein naar Utrecht vertrok elke ochtend om tien over zeven.",
	"Anna gaf Michel een hand en liet die iets te lang vasthouden.",
	"Meneer Bakker legde zijn bril op de krant en wreef in zijn ogen.",
	"Michels moeder was gestorven in de winter van datzelfde jaar.",
	'Sanne zei: "Ja, natuurlijk kom ik, maar niet voor het donker wordt."',
	"Papa lachte zoals hij vroeger lachte, kort en zonder geluid.",
	"Er stond een fiets tegen de muur die niemand van hen herkende.",
	"Joris Bakker schonk twee glazen in en schoof er een naar Michel toe.",
	"Anna las de brief nog een keer en vouwde hem daarna weg.",
	'Later vroeg Anna: "Waarom neemt Michel de trein en niet de bus?"',
	'Sanne begon over de brief en zei: "Waarom heeft niemand hem geopend?"',
	'Iedereen zweeg, en toen zei Papa: "Waarom zou dat nu nog uitmaken?"',
	'De buurvrouw riep naar boven: "Nee, dat kan echt niet zo doorgaan."',
	'Anna wees naar de deur en zei: "Nee, hij is er vanochtend al geweest."',
	"Daar stond meneer Bakker, met zijn hoed nog in zijn handen.",
	"Aan tafel zat Joris Bakker te wachten tot iemand iets zou zeggen.",
	"Iedereen wist dat Joris Bakker de laatste was die haar had gesproken.",
	"In de la vond Anna Michels oude schoolrapport uit 1953.",
	"Op zolder lagen Michels boeken nog in dezelfde doos als toen.",
];

/**
 * English, and the mirror image: `Roberts` and `Robert` are two different
 * people and have to stay that way, which is what stops a fix for the Dutch
 * genitive from being applied to a language that does not have one.
 */
export const ENGLISH = [
	'Robert stood at the window and said, "It is raining again, of course."',
	"Sergeant Roberts had served under three captains and outlived all of them.",
	"Mrs. Hale shook her head and asked why nobody had mentioned the letter.",
	"Robert’s coat was still hanging on the hook beside the front door.",
	"Thomas Ashby lived in the same house on the canal for thirty years.",
	"Later Roberts came in with a bundle of newspapers under his arm.",
	"Anna thought about the summer when Robert first came to dinner.",
	"He never understood why Roberts refused to speak about the war.",
	"Mr. Ashby nodded slowly and said nothing more about the business.",
	"Robert went down the stairs and heard Thomas rummaging in the kitchen.",
	"The letter lay unopened on the hall table for three days together.",
	"Anna made tea and cut the bread that Thomas Ashby had brought.",
	'Roberts looked at Robert and said, "That is precisely what I meant."',
	"Robert’s handwriting was small and crooked and almost impossible to read.",
	"The house smelled of wet wool and of the morning’s coffee.",
	"Anna and Mrs. Hale talked well past midnight about their mother.",
	"Thomas had kept the photograph in a drawer that never quite shut.",
	"Robert did not know what to say, and so he said nothing at all.",
	"She wondered why Thomas Ashby spoke so little of his own son.",
	"Anna shook hands with Robert and held on a moment too long.",
	"Mr. Ashby put his glasses on the newspaper and rubbed his eyes.",
	"Roberts poured two glasses and pushed one of them across to Robert.",
	"Anna read the letter once more and then folded it away again.",
	"In the drawer Anna found Robert’s old school report from 1953.",
	"Upstairs, Roberts kept his books in the same box he always had.",
];

const BOOKS = {
	"paper-nl.epub": {
		title: "De Brief van Michel",
		author: "Willem Voskuil",
		language: "nl",
		pool: DUTCH,
		chapter: (n) => `Hoofdstuk ${n}`,
	},
	"paper-en.epub": {
		title: "The Letter",
		author: "Edith Marlowe",
		language: "en",
		pool: ENGLISH,
		chapter: (n) => `Chapter ${n}`,
	},
};

/** Write the fixtures and return their paths by filename. */
export function build(dir, { chapters = 8, sentences = 36 } = {}) {
	mkdirSync(dir, { recursive: true });
	const out = {};
	for (const [name, book] of Object.entries(BOOKS)) {
		out[name] = writeEpub(join(dir, name), {
			title: book.title,
			author: book.author,
			language: book.language,
			chapters: Array.from({ length: chapters }, (_, i) => ({
				title: book.chapter(i + 1),
				paragraphs: proseFrom(book.pool, { sentences, seed: i + 1 }),
			})),
		});
	}
	return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const dir = process.argv[2] ?? ".fixtures";
	for (const path of Object.values(build(dir))) console.log(path);
}
