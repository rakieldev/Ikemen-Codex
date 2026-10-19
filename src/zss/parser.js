'use strict';

// Pure .zss parser: finds [StateDef N; ...] and [Function Name(args)].
// Headers may span several lines. Comments in ZSS start with '#'.

const { headerEndLine } = require('./header');
const { titleAbove } = require('../shared/comments');

const RE_HEADER_START = /^\s*\[/;
const RE_STATEDEF = /^statedef\s+([^;]*?)\s*(?:;(.*))?$/i;
const RE_FUNCTION = /^function\s+([A-Za-z_][\w.]*)\s*(?:\(([^)]*)\))?\s*$/i;

function isComment(text) {
	return text.trim().startsWith('#');
}

function isBlankOrComment(text) {
	return text.trim() === '' || isComment(text);
}

// Text between "[" and "]" of the header spanning lines start..endLine, comments removed
function headerText(lines, start, endLine) {
	const parts = [];
	for (let i = start; i <= endLine; i++) {
		const hash = lines[i].indexOf('#');
		parts.push(hash === -1 ? lines[i] : lines[i].slice(0, hash));
	}
	const joined = parts.join(' ');
	const open = joined.indexOf('[');
	const close = joined.lastIndexOf(']');
	return joined.slice(open + 1, close === -1 ? joined.length : close).replace(/\s+/g, ' ').trim();
}

function shorten(text, max) {
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function parseZss(lines) {
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		if (!RE_HEADER_START.test(lines[i])) continue;
		const headerEnd = headerEndLine(lines, i);
		const text = headerText(lines, i, headerEnd);

		let m;
		if ((m = RE_STATEDEF.exec(text))) {
			const params = (m[2] || '').replace(/;\s*$/, '').trim();
			heads.push({ line: i, headerEnd, kind: 'statedef', label: m[1], detail: shorten(params, 80) });
		} else if ((m = RE_FUNCTION.exec(text))) {
			const args = (m[2] || '').trim();
			heads.push({ line: i, headerEnd, kind: 'function', label: m[1], detail: '(' + args + ')' });
		} else {
			heads.push({ line: i, headerEnd, kind: 'section', label: text, detail: '' });
		}
		i = headerEnd;      // continuation lines belong to this header
	}

	const lastLine = lines.length - 1;
	return heads.map((h, i) => {
		let end = i + 1 < heads.length ? heads[i + 1].line - 1 : lastLine;
		while (end > h.headerEnd && isBlankOrComment(lines[end])) end--;

		const title = titleAbove(lines, h.line, '#');
		let name;
		if (h.kind === 'statedef') name = 'StateDef ' + h.label;
		else if (h.kind === 'function') name = 'Function ' + h.label;
		else name = h.label || '(no name)';
		if (title && h.kind !== 'section') name += ' - ' + title;

		return {
			kind: h.kind,
			name,
			detail: h.detail,
			startLine: h.line,
			endLine: Math.max(end, h.headerEnd),
			children: []
		};
	});
}

module.exports = { parseZss };
