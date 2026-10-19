'use strict';

// Pure parser (no VS Code dependency): takes the lines of the file and
// returns the list of symbols. Kept separate so it can be reused later
// (go to definition, diagnostics, etc.).

const { titleAbove } = require('../shared/comments');

const RE_STATEDEF = /^\s*\[\s*statedef\s+([^\]\n]*?)\s*\]/i;
const RE_STATE = /^\s*\[\s*state\s+([^\]\n]*?)\s*\]/i;
const RE_SECTION = /^\s*\[([^\]\n]*)\]/;
const RE_TYPE = /^\s*type\s*=\s*([A-Za-z_]\w*)/i;

function isComment(text) {
	return text.trim().startsWith(';');
}

// Looks for "type = X" inside a controller to show it as the detail.
function controllerType(lines, from, to) {
	for (let i = from; i <= to; i++) {
		const m = RE_TYPE.exec(lines[i]);
		if (m) return m[1];
	}
	return '';
}

function parseSymbols(lines) {
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		let m;
		if ((m = RE_STATEDEF.exec(lines[i]))) {
			heads.push({ line: i, kind: 'statedef', label: m[1] });
		} else if ((m = RE_STATE.exec(lines[i]))) {
			heads.push({ line: i, kind: 'state', label: m[1] });
		} else if ((m = RE_SECTION.exec(lines[i]))) {
			heads.push({ line: i, kind: 'section', label: m[1].trim() });
		}
	}

	const lastLine = lines.length - 1;

	// End of each symbol: the line before the next header that closes it,
	// not counting trailing blank/comment lines (they belong to the next one).
	heads.forEach((h, i) => {
		let next = -1;
		for (let j = i + 1; j < heads.length; j++) {
			// a Statedef only closes at another Statedef or section; the others close at any header
			if (h.kind !== 'statedef' || heads[j].kind !== 'state') {
				next = j;
				break;
			}
		}
		let end = next === -1 ? lastLine : heads[next].line - 1;
		while (end > h.line && (lines[end].trim() === '' || isComment(lines[end]))) end--;
		h.end = end;
	});

	const out = [];
	let current = null;
	for (const h of heads) {
		const sym = { startLine: h.line, endLine: h.end, detail: '', children: [] };
		if (h.kind === 'statedef') {
			const title = titleAbove(lines, h.line, ';');
			sym.kind = 'statedef';
			sym.name = 'Statedef ' + h.label + (title ? ' - ' + title : '');
			out.push(sym);
			current = sym;
		} else if (h.kind === 'state') {
			sym.kind = 'state';
			sym.name = 'State ' + h.label;
			sym.detail = controllerType(lines, h.line + 1, h.end);
			(current ? current.children : out).push(sym);
		} else {
			sym.kind = 'section';
			sym.name = h.label || '(sem nome)';
			out.push(sym);
			current = null;
		}
	}
	return out;
}

module.exports = { parseSymbols };
