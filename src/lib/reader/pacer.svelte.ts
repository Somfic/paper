import { untrack } from "svelte";
import type { ReaderController } from "./reader.svelte";
import type { ReaderSettings } from "./settings.svelte";

// Reading-speed bounds. A sample outside these is not reading: below MIN_WPM is
// a page left open (a phone call, a bookmark), above MAX_WPM is a flick through
// front matter or a mis-estimated page.
export const DEFAULT_WPM = 240; // adult silent prose, the usual quoted figure
export const MIN_WPM = 90;
export const MAX_WPM = 800;

// Dwell bounds, a second guard on the same idea from the other side: a page that
// was visible for barely a second was never read, and one open for five minutes
// tells us about the reader's kitchen, not their eyes.
const MIN_DWELL_MS = 1_200;
const MAX_DWELL_MS = 5 * 60_000;

// Short pages (a chapter heading, a plate, a stub of dialogue) have a word
// estimate dominated by its own error, so they never become samples.
const MIN_SAMPLE_WORDS = 30;

const SAMPLES_KEPT = 24;
export const ENOUGH_SAMPLES = 5; // page turns before we trust the measurement

// The drain's own limits, so a one-line page doesn't blink out and a dense one
// doesn't sit at full for a quarter of an hour.
const MIN_DURATION_MS = 2_500;
const MAX_DURATION_MS = 10 * 60_000;

// foliate re-renders a few times while a book opens, and its resize observer's
// callback is unguarded against a section iframe that is still swapping. Any
// running animation elsewhere on the page hands it that notification early
// enough to trip over one, so the drain waits for the opening to settle.
const SETTLE_MS = 1_200;

const STORAGE_KEY = "paper.pacer";

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/g;

/**
 * Words in a run of text. CJK has no spaces, so its ideographs are counted one
 * apiece — not a word each, but the right order of magnitude for pacing.
 */
export function countWords(text: string): number {
	const cjk = text.match(CJK)?.length ?? 0;
	const rest = text.replace(CJK, " ").trim();
	return (rest ? rest.split(/\s+/).length : 0) + cjk;
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const mid = s.length >> 1;
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/**
 * The reader's measured page-turn cadence, in words per minute. One instance is
 * shared by the pacer (which feeds it) and the settings menu (which reports it),
 * so it lives at module scope rather than per-component.
 *
 * The estimate is the median of the recent accepted samples: a median shrugs off
 * the one page someone re-read three times, where a mean would not.
 */
export class ReadingSpeed {
	samples = $state<number[]>([]);

	constructor() {
		try {
			const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			if (Array.isArray(raw?.samples))
				this.samples = raw.samples
					.filter(
						(n: unknown) =>
							typeof n === "number" && n >= MIN_WPM && n <= MAX_WPM,
					)
					.slice(-SAMPLES_KEPT);
		} catch {}
	}

	/** Median of the samples, or `null` while there is too little evidence. */
	measured = $derived(
		this.samples.length >= ENOUGH_SAMPLES
			? Math.round(median(this.samples))
			: null,
	);

	/** Take a page-turn observation. Outliers are dropped, not clamped in. */
	record(words: number, dwellMs: number) {
		if (words < MIN_SAMPLE_WORDS) return;
		if (dwellMs < MIN_DWELL_MS || dwellMs > MAX_DWELL_MS) return;
		const wpm = (words / dwellMs) * 60_000;
		if (wpm < MIN_WPM || wpm > MAX_WPM) return;
		this.samples = [...this.samples, Math.round(wpm)].slice(-SAMPLES_KEPT);
		this.#save();
	}

	/** Forget the measurements (the menu offers this beside the readout). */
	reset() {
		this.samples = [];
		this.#save();
	}

	#save() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ v: 1, samples: this.samples }),
			);
		} catch {}
	}
}

export const readingSpeed = new ReadingSpeed();

/** What the open page was, so its dwell can become a sample when it is left. */
type OpenPage = {
	href: string;
	page: number;
	words: number;
	at: number;
	layout: string;
	interrupted: boolean;
};

// Anything here changes how much text fits on a page, which invalidates the
// estimate made when the page opened.
function layoutKey(s: ReaderSettings): string {
	return `${s.fontSize}/${s.lineHeight}/${s.singleColumn}/${s.flow}`;
}

/**
 * Ambient page pacer: how long the visible page should take, and how much of
 * that is left. The component draws a hairline from `durationMs` and restarts it
 * whenever `run` ticks; nothing here touches the book's text or turns a page.
 */
export class PagePacer {
	/** Estimated words on the visible page (0 = no honest estimate available). */
	pageWords = $state(0);
	/** Bumped on every page change — the drain restarts on it. */
	run = $state(0);
	/** The book has finished opening; see SETTLE_MS. */
	settled = $state(false);

	#reader: ReaderController;
	#settings: ReaderSettings;
	#open: OpenPage | null = null;
	#sectionWords = 0;
	#dispose: (() => void) | null = null;

	constructor(reader: ReaderController, settings: ReaderSettings) {
		this.#reader = reader;
		this.#settings = settings;
	}

	/** Words per minute the drain paces to: the reader's override, else measured. */
	wpm = $derived.by(() =>
		this.#settings.pacerWpm > 0
			? clamp(this.#settings.pacerWpm, MIN_WPM, MAX_WPM)
			: (readingSpeed.measured ?? DEFAULT_WPM),
	);

	durationMs = $derived.by(() =>
		this.pageWords > 0
			? clamp(
					(this.pageWords / this.wpm) * 60_000,
					MIN_DURATION_MS,
					MAX_DURATION_MS,
				)
			: 0,
	);

	// Scrolled flow has no page to pace, so the pacer draws nothing there rather
	// than pacing something it cannot see the end of. Otherwise the track is
	// always drawn — furniture that appeared and vanished per page would be more
	// distracting than the drain it carries, and an unmeasurable page (a plate, a
	// map) just sits full.
	active = $derived.by(
		() =>
			this.settled &&
			this.#settings.pacer &&
			this.#settings.flow === "paginated",
	);

	/** Start observing page turns. Returns a disposer. */
	connect(): () => void {
		this.#dispose?.();
		this.#dispose = $effect.root(() => {
			// Section text is the fallback estimate; foliate hands us each section's
			// document once, as it renders.
			$effect(() =>
				this.#reader.onSection((doc) => {
					this.#sectionWords = countWords(doc?.body?.textContent ?? "");
				}),
			);

			$effect(() => {
				if (!this.#reader.ready) {
					this.settled = false;
					return;
				}
				const t = setTimeout(() => (this.settled = true), SETTLE_MS);
				return () => clearTimeout(t);
			});

			// A page nobody was looking at teaches us nothing about reading speed.
			$effect(() => {
				const onHide = () => {
					if (document.hidden && this.#open) this.#open.interrupted = true;
				};
				document.addEventListener("visibilitychange", onHide);
				return () => document.removeEventListener("visibilitychange", onHide);
			});

			// Depend on exactly the four values that identify a page, and on nothing
			// this handler itself writes — otherwise recording a sample or resetting
			// the drain re-triggers the effect that did it.
			$effect(() => {
				const href = this.#reader.currentHref;
				const page = this.#reader.chapterPageRaw;
				const pages = this.#reader.chapterPages;
				const layout = layoutKey(this.#settings);
				untrack(() => this.#onPage(href, page, pages, layout));
			});

			return () => {
				this.#open = null;
			};
		});
		return () => {
			this.#dispose?.();
			this.#dispose = null;
		};
	}

	// The page changed: close the books on the old one, then measure the new one.
	#onPage(href: string, page: number, pages: number, layout: string) {
		const now = performance.now();
		const open = this.#open;
		// foliate relocates for reasons other than turning a page (an anchor jump
		// that lands where we already are, a re-render). The same page is not a new
		// one, and must not restart the drain.
		if (
			open &&
			open.href === href &&
			open.page === page &&
			open.layout === layout
		)
			return;
		// Only a plain forward turn inside one chapter is evidence. A jump from the
		// chapter menu, a step back to re-read, a section boundary and a font-size
		// change all arrive here looking like page turns, and none of them is a
		// timed read of a page we estimated.
		if (
			open &&
			!open.interrupted &&
			open.href === href &&
			open.layout === layout &&
			page === open.page + 1
		)
			readingSpeed.record(open.words, now - open.at);

		const words = this.#estimate(pages);
		this.#open = { href, page, words, at: now, layout, interrupted: false };
		this.pageWords = words;
		this.run++;
	}

	// Words on the *visible* page. foliate's relocate carries the visible Range —
	// bisected down to the character where visibility changes — so counting its
	// text is as close to the truth as the DOM gets. It goes stale between
	// relocates (a window resize reflows the page without firing one), and the
	// fallback is a flat chapter average, so this is an honest estimate rather
	// than an exact count.
	#estimate(pages: number): number {
		const range = this.#reader.visibleRange;
		if (range) {
			try {
				const words = countWords(range.toString());
				if (words > 0) return words;
			} catch {} // the range belongs to a section document that may be gone
		}
		return pages > 0 && this.#sectionWords > 0
			? Math.round(this.#sectionWords / pages)
			: 0;
	}
}
