'use strict';

// Pure .air parser: finds every [Begin Action N] and counts its frames.

const { titleAbove } = require('../shared/comments');

const RE_ACTION = /^\s*\[\s*begin\s+action\s+([^\]\n]*?)\s*\]/i;
// frame: group, image, x, y, time (the remaining fields are optional)
const RE_FRAME = /^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;

function isBlankOrComment(text) {
	const t = text.trim();
	return t === '' || t.startsWith(';');
}

function parseActions(lines) {
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		const m = RE_ACTION.exec(lines[i]);
		if (m) heads.push({ line: i, label: m[1] });
	}

	const lastLine = lines.length - 1;
	return heads.map((h, i) => {
		let end = i + 1 < heads.length ? heads[i + 1].line - 1 : lastLine;
		while (end > h.line && isBlankOrComment(lines[end])) end--;

		let frames = 0;
		for (let l = h.line + 1; l <= end; l++) {
			if (RE_FRAME.test(lines[l])) frames++;
		}

		const title = titleAbove(lines, h.line, ';');
		return {
			kind: 'action',
			name: 'Action ' + h.label + (title ? ' - ' + title : ''),
			detail: frames + (frames === 1 ? ' frame' : ' frames'),
			startLine: h.line,
			endLine: end,
			children: []
		};
	});
}

module.exports = { parseActions };
