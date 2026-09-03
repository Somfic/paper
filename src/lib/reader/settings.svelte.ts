import type { ThemeName } from "./themes";

export type Settings = {
	theme: ThemeName;
	fontSize: number; // percent
	lineHeight: number;
	justify: boolean;
	flow: "paginated" | "scrolled";
	singleColumn: boolean;
	shading: boolean;
	pacer: boolean;
	pacerWpm: number; // 0 = pace to the measured speed, > 0 = the reader's target
};

export const DEFAULTS: Settings = {
	theme: "sepia",
	fontSize: 100,
	lineHeight: 1.6,
	justify: true,
	flow: "paginated",
	singleColumn: false,
	shading: false,
	pacer: false,
	pacerWpm: 0,
};

const STORAGE_KEY = "paper.reader";

function loadSettings(): Settings {
	try {
		return {
			...DEFAULTS,
			...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
		};
	} catch {
		return { ...DEFAULTS };
	}
}

/**
 * Reactive reader preferences. Fields are plain `$state`, so components can read
 * and assign them directly (`settings.theme = "dark"`). Persistence to
 * localStorage runs in a self-owned `$effect.root` started by `connect()`;
 * call the returned disposer (or `dispose()`) on teardown.
 */
export class ReaderSettings {
	theme = $state<ThemeName>(DEFAULTS.theme);
	fontSize = $state(DEFAULTS.fontSize);
	lineHeight = $state(DEFAULTS.lineHeight);
	justify = $state(DEFAULTS.justify);
	flow = $state<Settings["flow"]>(DEFAULTS.flow);
	singleColumn = $state(DEFAULTS.singleColumn);
	shading = $state(DEFAULTS.shading);
	pacer = $state(DEFAULTS.pacer);
	pacerWpm = $state(DEFAULTS.pacerWpm);

	#dispose: (() => void) | null = null;

	constructor() {
		Object.assign(this, loadSettings());
	}

	/**
	 * The fields the renderer actually consumes: everything `contentCSS()` sets,
	 * plus the two that decide the column layout. Anything watching the renderer
	 * has to read this rather than `value`, because re-applying the renderer
	 * re-paginates the whole book — work that a paper-grain toggle or a nudge of
	 * the pacer's target speed has no reason to be paying for.
	 */
	get layout() {
		return {
			theme: this.theme,
			fontSize: this.fontSize,
			lineHeight: this.lineHeight,
			justify: this.justify,
			flow: this.flow,
			singleColumn: this.singleColumn,
		};
	}

	/** Plain object snapshot — handy for `contentCSS()` and persistence. */
	get value(): Settings {
		return {
			theme: this.theme,
			fontSize: this.fontSize,
			lineHeight: this.lineHeight,
			justify: this.justify,
			flow: this.flow,
			singleColumn: this.singleColumn,
			shading: this.shading,
			pacer: this.pacer,
			pacerWpm: this.pacerWpm,
		};
	}

	/** Start persisting changes to localStorage. Returns a disposer. */
	connect(): () => void {
		this.#dispose?.();
		this.#dispose = $effect.root(() => {
			$effect(() => {
				const snap = this.value;
				try {
					localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
				} catch {}
			});
		});
		return () => this.dispose();
	}

	dispose() {
		this.#dispose?.();
		this.#dispose = null;
	}

	/**
	 * Step the pacer's target speed by `delta` wpm, starting from `from` (what it
	 * paces to now) the first time — so the first nudge moves away from the speed
	 * the reader is actually seeing, not from a round number. Stepping below the
	 * floor hands the pacing back to the measurement.
	 */
	stepPacerWpm(delta: number, from: number) {
		const base = this.pacerWpm > 0 ? this.pacerWpm : from;
		const next = Math.round(base / 10) * 10 + delta;
		this.pacerWpm = next < 90 ? 0 : Math.min(800, next);
	}

	/** Step font size (percent) or line height by `delta`, clamped. */
	adjust(key: "fontSize" | "lineHeight", delta: number) {
		if (key === "fontSize") {
			this.fontSize = Math.min(220, Math.max(60, this.fontSize + delta));
		} else {
			this.lineHeight =
				Math.round(
					Math.min(2.4, Math.max(1.1, this.lineHeight + delta)) * 10,
				) / 10;
		}
	}
}
