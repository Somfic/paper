import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

// A minimal epub writer. Everything is stored uncompressed, which keeps this to
// one CRC table and no zlib: fixtures are a few thousand words, and an epub
// reader neither knows nor cares.

const CRC = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function zip(entries) {
	const parts = [];
	const central = [];
	let offset = 0;

	for (const [name, content] of entries) {
		const data = Buffer.from(content);
		const nameBuf = Buffer.from(name, "utf8");
		const sum = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0, 6); // flags
		local.writeUInt16LE(0, 8); // method: stored
		local.writeUInt32LE(sum, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		parts.push(local, nameBuf, data);

		const dir = Buffer.alloc(46);
		dir.writeUInt32LE(0x02014b50, 0);
		dir.writeUInt16LE(20, 4); // version made by
		dir.writeUInt16LE(20, 6); // version needed
		dir.writeUInt16LE(0, 8);
		dir.writeUInt16LE(0, 10);
		dir.writeUInt32LE(sum, 16);
		dir.writeUInt32LE(data.length, 20);
		dir.writeUInt32LE(data.length, 24);
		dir.writeUInt16LE(nameBuf.length, 28);
		dir.writeUInt32LE(offset, 42);
		central.push(dir, nameBuf);

		offset += local.length + nameBuf.length + data.length;
	}

	const cd = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(cd.length, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...parts, cd, end]);
}

const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Write an epub.
 *
 * `chapters` is `[{ title, paragraphs }]`. Whole sentences per paragraph, please
 * — the scan treats a block edge as a hard sentence boundary, so a paragraph
 * that cuts a sentence in half changes exactly the signals a cast fixture is
 * usually built to exercise.
 */
export function writeEpub(path, { title, author, language = "en", chapters }) {
	const files = chapters.map((c, i) => ({
		...c,
		file: `ch${i + 1}.xhtml`,
		id: `c${i + 1}`,
	}));

	const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(title)}</dc:title>
<dc:creator>${esc(author)}</dc:creator>
<dc:language>${esc(language)}</dc:language>
<dc:identifier id="bid">urn:uuid:${Buffer.from(title).toString("hex").slice(0, 12).padEnd(12, "0")}-0000-0000-0000-000000000000</dc:identifier>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${files.map((f) => `<item id="${f.id}" href="${f.file}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine>
${files.map((f) => `<itemref idref="${f.id}"/>`).join("\n")}
</spine>
</package>`;

	const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${esc(title)}</title></head><body>
<nav epub:type="toc"><h1>Contents</h1><ol>
${files.map((f) => `<li><a href="${f.file}">${esc(f.title)}</a></li>`).join("\n")}
</ol></nav></body></html>`;

	const entries = [
		// The mimetype has to be the first entry in the archive.
		["mimetype", "application/epub+zip"],
		["META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`],
		["OEBPS/content.opf", opf],
		["OEBPS/nav.xhtml", nav],
		...files.map((f) => [
			`OEBPS/${f.file}`,
			`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(f.title)}</title></head>
<body><h2>${esc(f.title)}</h2>${f.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</body></html>`,
		]),
	];

	writeFileSync(path, zip(entries));
	return path;
}

/** Deal sentences from a pool into paragraphs, the same way every run. */
export function proseFrom(pool, { sentences = 36, perParagraph = 4, seed = 1 }) {
	let state = seed >>> 0 || 1;
	const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
	const lines = Array.from({ length: sentences }, () => pool[Math.floor(next() * pool.length)]);
	const paragraphs = [];
	for (let i = 0; i < lines.length; i += perParagraph)
		paragraphs.push(lines.slice(i, i + perParagraph).join(" "));
	return paragraphs;
}

// ── reading one back ───────────────────────────────────────────

/**
 * The files inside an epub, by name. Enough of a zip reader for the offline
 * probe below: stored and deflated entries, no encryption, no zip64. Reading
 * real books matters more than reading fixtures — the heuristics are only
 * interesting against prose someone actually published.
 */
export function readEpub(path) {
	const buf = readFileSync(path);
	// The end-of-central-directory record is last, after a comment of unknown
	// length, so it has to be found by scanning backwards for its signature.
	let eocd = buf.length - 22;
	while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
	if (eocd < 0) throw new Error(`${path} is not a zip`);

	const count = buf.readUInt16LE(eocd + 10);
	let at = buf.readUInt32LE(eocd + 16);
	const files = new Map();

	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(at) !== 0x02014b50) break;
		const method = buf.readUInt16LE(at + 10);
		const csize = buf.readUInt32LE(at + 20);
		const nameLen = buf.readUInt16LE(at + 28);
		const extraLen = buf.readUInt16LE(at + 30);
		const commentLen = buf.readUInt16LE(at + 32);
		const offset = buf.readUInt32LE(at + 42);
		const name = buf.toString("utf8", at + 46, at + 46 + nameLen);

		// The local header repeats the name and extra field, at its own lengths.
		const localName = buf.readUInt16LE(offset + 26);
		const localExtra = buf.readUInt16LE(offset + 28);
		const from = offset + 30 + localName + localExtra;
		const raw = buf.subarray(from, from + csize);
		files.set(name, method === 8 ? inflateRawSync(raw) : raw);

		at += 46 + nameLen + extraLen + commentLen;
	}
	return files;
}

const BLOCK_TAGS =
	/<\/?(?:address|article|aside|blockquote|br|caption|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

const entities = (s) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&mdash;/g, "\u2014")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

const strip = (html) => entities(html.replace(/<[^>]+>/g, ""));

/**
 * An epub's readable sections as plain text, in spine order, with block edges
 * turned into U+2029 the way `flattenSection` does for a rendered document.
 *
 * This is a *stand-in* for the real flattening, done with regexes because there
 * is no DOM out here. It is close enough to iterate on the scan's heuristics in
 * a second rather than a minute — but the browser is what decides, so confirm a
 * finding there before believing it.
 */
export function sectionsOf(path, { separator = "\u2029" } = {}) {
	const files = readEpub(path);
	const opfName = [...files.keys()].find((n) => n.endsWith(".opf"));
	if (!opfName) throw new Error(`${path} has no .opf`);
	const opf = files.get(opfName).toString("utf8");
	const base = opfName.includes("/") ? opfName.replace(/[^/]+$/, "") : "";

	const manifest = new Map();
	for (const item of opf.matchAll(/<item\b[^>]*>/g)) {
		const id = /id="([^"]+)"/.exec(item[0])?.[1];
		const href = /href="([^"]+)"/.exec(item[0])?.[1];
		if (id && href) manifest.set(id, base + decodeURIComponent(href));
	}

	// Spine order, skipping the non-linear items — front matter and back matter
	// that the reader itself also skips.
	const order = [...opf.matchAll(/<itemref\b[^>]*>/g)]
		.filter((ref) => !/linear="no"/.test(ref[0]))
		.map((ref) => manifest.get(/idref="([^"]+)"/.exec(ref[0])?.[1]))
		.filter((name) => name && /\.x?html?$/i.test(name) && files.has(name));

	const meta = (tag) =>
		new RegExp(`<dc:${tag}[^>]*>([^<]+)<`).exec(opf)?.[1]?.trim() ?? "";

	const sections = order.map((name, index) => {
		const html = files
			.get(name)
			.toString("utf8")
			.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "");

		const text = strip(html.replace(BLOCK_TAGS, separator)).replace(
			new RegExp(`${separator}(?:\\s*${separator})+`, "g"),
			separator,
		);

		// Heading spans are found by looking the heading's own text back up in the
		// flattened string, advancing through it so a repeated heading still lands
		// on its own copy.
		const headings = [];
		let cursor = 0;
		for (const h of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
			const label = strip(h[1]).trim();
			if (!label) continue;
			const from = text.indexOf(label, cursor);
			if (from < 0) continue;
			headings.push([from, from + label.length]);
			cursor = from + label.length;
		}

		return { index, text, headings };
	});

	return {
		title: meta("title"),
		author: meta("creator"),
		language: meta("language") || undefined,
		sections,
	};
}
