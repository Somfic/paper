// The character scan, off the main thread. Sections arrive one at a time (the
// main thread has to parse each one with foliate to get its text, and would
// rather not hold a whole book's worth of strings in one postMessage), then
// `build` runs the heuristics and hands back the finished index.
//
// The worker never sees a DOM — workers have no DOMParser — so the main thread
// flattens each section to plain text first and everything here is string work.

import { INDEX_VERSION, type CharacterIndex } from "./characters";
import { extract, type SectionText } from "./characters-extract";

export type ScanRequest =
	| { kind: "section"; section: SectionText }
	| { kind: "build"; labels: (string | undefined)[]; exclude: string[] };

export type ScanResponse =
	| { kind: "done"; index: CharacterIndex }
	| { kind: "error"; message: string };

const ctx = self as unknown as Worker;

let sections: SectionText[] = [];

ctx.onmessage = (event: MessageEvent<ScanRequest>) => {
	const message = event.data;
	if (message.kind === "section") {
		sections.push(message.section);
		return;
	}
	try {
		const entries = extract(sections, { exclude: message.exclude });
		const index: CharacterIndex = {
			version: INDEX_VERSION,
			built_at: new Date().toISOString(),
			labels: message.labels,
			entries,
		};
		ctx.postMessage({ kind: "done", index } satisfies ScanResponse);
	} catch (e) {
		ctx.postMessage({
			kind: "error",
			message: e instanceof Error ? e.message : String(e),
		} satisfies ScanResponse);
	} finally {
		// The texts are the biggest thing in here; don't hold them after a build.
		sections = [];
	}
};
