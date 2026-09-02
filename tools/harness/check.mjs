/**
 * The smallest thing that can fail a script. Assertions are one line each and
 * print as they run, so a script that dies halfway still tells you how far it
 * got — which matters when every check costs a page load and a book scan.
 */
export function checks(title) {
	if (title) console.log(title);
	const failures = [];
	const errors = [];

	return {
		ok(label, condition) {
			if (!condition) failures.push(label);
			console.log(`  ${condition ? "ok  " : "FAIL"}  ${label}`);
			return !!condition;
		},

		/**
		 * Collect the page's console errors. Foliate's own relayout null and the
		 * missing favicon are noise on every run; everything else is a finding.
		 */
		watch(page, ignore = [/favicon/, /404 \(Not Found\)/]) {
			page.on("console", (m) => {
				const text = m.text();
				if (m.type() !== "error") return;
				if (ignore.some((re) => re.test(text))) return;
				errors.push(text.slice(0, 160));
			});
			page.on("pageerror", (e) => errors.push(`uncaught: ${String(e).slice(0, 160)}`));
		},

		/** Print the tally and set the exit code. Call it last. */
		done() {
			if (errors.length) console.log(`\nconsole errors:\n  ${errors.join("\n  ")}`);
			else console.log("\nno console errors");
			if (failures.length) {
				console.log(`${failures.length} failed: ${failures.join("; ")}`);
				process.exitCode = 1;
			}
			return failures.length === 0 && errors.length === 0;
		},
	};
}
