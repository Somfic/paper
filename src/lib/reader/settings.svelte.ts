import type { ThemeName } from "./themes";

export type Settings = {
	theme: ThemeName;
	fontSize: number; // percent
	lineHeight: number;
	justify: boolean;
	flow: "paginated" | "scrolled";
	singleColumn: boolean;
	shading: boolean;
};

export const DEFAULTS: Settings = {
	theme: "sepia",
	fontSize: 100,
	lineHeight: 1.6,
	justify: true,
	flow: "paginated",
	singleColumn: false,
	shading: false,
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

	#dispose: (() => void) | null = null;

	constructor() {
		Object.assign(this, loadSettings());
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
