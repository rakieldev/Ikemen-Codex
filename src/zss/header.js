'use strict';

// ZSS section headers may span several lines, with comments in between:
//
//   [StateDef 170;
//   type: S;            #State-type
//   sprpriority: 1;]
//
// These helpers find where such a header ends. A blank line ends a header that was never closed.

// Text version: `from` is the offset of the "[". Returns { end, closed }:
// the offset of the closing "]", or (when never closed) the end of the first line.
function headerEndOffset(text, from) {
	let pos = from;
	let firstEol = -1;
	while (pos <= text.length) {
		let eol = text.indexOf('\n', pos);
		if (eol === -1) eol = text.length;
		if (firstEol === -1) firstEol = eol;

		const line = text.slice(pos, eol);
		const hash = line.indexOf('#');
		const code = hash === -1 ? line : line.slice(0, hash);
		const close = code.indexOf(']');
		if (close !== -1) return { end: pos + close, closed: true };

		if (eol >= text.length) break;
		pos = eol + 1;
		const nextEol = text.indexOf('\n', pos);
		if (/^\s*$/.test(text.slice(pos, nextEol === -1 ? text.length : nextEol))) break;
	}
	return { end: firstEol, closed: false };
}

// Lines version: `start` is the index of the line with the "[".
// Returns the index of the line that holds the closing "]" (or `start` when never closed).
function headerEndLine(lines, start) {
	for (let i = start; i < lines.length; i++) {
		if (i > start && /^\s*$/.test(lines[i])) break;
		const hash = lines[i].indexOf('#');
		const code = hash === -1 ? lines[i] : lines[i].slice(0, hash);
		if (code.includes(']')) return i;
	}
	return start;
}

module.exports = { headerEndOffset, headerEndLine };
