import type { Settings } from "./settings.svelte";

// ── reader themes ──────────────────────────────────────────────
export type ThemeName = "light" | "sepia" | "dark";

export type Theme = {
	scheme: string;
	bg: string;
	fg: string;
	dim: string;
	link: string;
	chrome: string;
	border: string;
	surface: string;
};

export const THEMES: Record<ThemeName, Theme> = {
	light: {
		scheme: "light",
		bg: "#fbfaf7",
		fg: "#1c1b19",
		dim: "#6b6862",
		link: "#0b5cad",
		chrome: "#f1efea",
		border: "rgba(0,0,0,0.10)",
		surface: "#e7e5df",
	},
	sepia: {
		scheme: "light",
		bg: "#f4ecd8",
		fg: "#5b4636",
		dim: "#8a7a63",
		link: "#9b4d1f",
		chrome: "#ece0c4",
		border: "rgba(91,70,54,0.18)",
		surface: "#e2d5b4",
	},
	dark: {
		scheme: "dark",
		bg: "#16161a",
		fg: "#c9c7c2",
		dim: "#807e79",
		link: "#8ab4f8",
		chrome: "#1f1f25",
		border: "rgba(255,255,255,0.12)",
		surface: "#0d0d10",
	},
};

// ── content stylesheet injected into the book itself ──
export function contentCSS(s: Settings): string {
	const t = THEMES[s.theme];
	return `
		html {
			color-scheme: ${t.scheme};
			color: ${t.fg} !important;
			background: ${t.bg} !important;
			font-size: ${s.fontSize}% !important;
		}
		body { background-color: ${t.bg} !important; color: ${t.fg} !important; }
		/* Books set their own ink, and a book that sets black text is unreadable
		   on a dark page. A plain "inherit" lost to almost all of it: a rule of
		   equal specificity in the book's own stylesheet wins on order, and the
		   inline style="color:#000" that most EPUBs carry wins over any
		   stylesheet at all. Only !important takes the ink back, and it has to
		   name the containers too — a colour set on a wrapping section is
		   inherited by every paragraph inside it, so overriding the paragraph
		   alone is not enough. Links get their colour back below, on a more
		   specific selector than this one.
		   (No backticks in here: this whole stylesheet is a template literal.) */
		p, li, blockquote, dd, dt, div, span, em, strong, i, b, small, sub, sup,
		h1, h2, h3, h4, h5, h6, td, th, caption, figcaption, pre, code,
		section, article, main, aside, header, footer, figure, hgroup {
			color: inherit !important;
		}
		p, li, blockquote, dd {
			line-height: ${s.lineHeight} !important;
			text-align: ${s.justify ? "justify" : "start"} !important;
			-webkit-hyphens: ${s.justify ? "auto" : "manual"};
			hyphens: ${s.justify ? "auto" : "manual"};
		}
		a, a:link, a:visited { color: ${t.link} !important; }
		img, image, svg, image > img { border-radius: 8px; }
	`;
}
