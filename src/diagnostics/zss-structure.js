'use strict';

// Local structural checks only. No controller schemas or cross-file resolution.
// Strings in ZSS end at the next quote (a backslash does not escape it).
function headerEnd(text, from) {
	const firstEol = text.indexOf('\n', from);
	const fallback = firstEol === -1 ? text.length : firstEol;
	const delimiters = [];
	let string = false;
	let comment = false;
	let lineStart = false;
	for (let i = from + 1; i < text.length; i++) {
		const c = text[i];
		if (c === '\n') { string = false; comment = false; lineStart = true; continue; }
		if (comment) continue;
		if (string) { if (c === '"') string = false; continue; }
		if (lineStart && /\s/.test(c)) continue;
		if (lineStart && c === '[' && /^\[\s*(?:statedef|function)\b/i.test(text.slice(i))) break;
		lineStart = false;
		if (c === '#') { comment = true; continue; }
		if (c === '"') { string = true; continue; }
		if (c === '{' || c === '}') break;
		if (c === '(' || c === '[') delimiters.push(c);
		else if (c === ')') delimiters.pop();
		else if (c === ']') {
			if (!delimiters.length) return { end: i + 1, closed: true };
			delimiters.pop(); // ZSS ranges may use mixed delimiters, e.g. (0, 1].
		}
	}
	return { end: fallback, closed: false };
}

function checkStructure(tokens, report) {
	const blocks = [];
	const states = new Set();
	const functions = new Set();
	let segment = [];
	let parens = 0;
	const punct = (t, value) => t && t.type === 'punct' && t.text === value;
	const error = (token, message, code) => report(token, token, 'error', message, code);
	const word = t => t && t.type === 'ident' ? t.text.toLowerCase() : '';

	function names(list) {
		if (!list.length) return [];
		for (let i = 0; i < list.length; i++) {
			if (i % 2 === 0 ? !/^[A-Za-z_]\w*$/.test(list[i].text) : !punct(list[i], ',')) return null;
		}
		return list.length % 2 === 1 ? list.filter((_, i) => i % 2 === 0) : null;
	}

	function duplicateNames(list, seen = new Set()) {
		if (!list) return;
		for (const t of list) {
			const key = t.text.toLowerCase();
			if (key === '_') continue;
			if (seen.has(key)) error(t, "Duplicate name '" + t.text + "' in this declaration.", 'duplicate-name');
			seen.add(key);
		}
		return seen;
	}

	function header(t) {
		for (const s of t.tokens) {
			if (s.type === 'string' && !s.closed) error(s, 'String is not enclosed in double quotes.', 'unterminated-string');
		}
		if (!t.closed) {
			error({ start: t.start, end: t.start + 1 }, "Missing ']' at the end of this header.", 'unclosed-header');
			return;
		}
		const list = t.tokens;
		if (word(list[0]) === 'statedef') {
			const semi = list.findIndex(x => punct(x, ';'));
			const number = list.slice(1, semi === -1 ? list.length : semi);
			// Resolve literal numbers only. Constants belong to the character, not this file.
			const literal = number.map(x => x.text).join('');
			if (number.length > 2 || !/^[+-]?\d+$/.test(literal)) return;
			let value = Number(literal);
			if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) return;
			if (literal === '+1') value = -10; // Engine's special State +1 identifier.
			if (states.has(value)) error(number[0], 'StateDef ' + literal + ' is already defined in this file.', 'duplicate-statedef');
			states.add(value);
		} else if (word(list[0]) === 'function' && list[1] && list[1].type === 'ident' && punct(list[2], '(')) {
			const close = list.findIndex(x => punct(x, ')'));
			if (close < 0) return;
			const args = names(list.slice(3, close));
			const rets = names(list.slice(close + 1));
			if (!args || !rets) return;
			const name = list[1].text.toLowerCase();
			if (functions.has(name)) error(list[1], "Function '" + list[1].text + "' is already defined in this file.", 'duplicate-function');
			functions.add(name);
			duplicateNames(rets, duplicateNames(args));
		}
	}

	function endSection() {
		// Report the innermost unclosed block instead of cascading over every ancestor.
		if (blocks.length) error(blocks[blocks.length - 1].token, "Missing '}' to close this block.", 'unclosed-block');
		blocks.length = 0;
		segment = [];
		parens = 0;
	}

	for (const t of tokens) {
		if (t.type === 'header') { endSection(); header(t); continue; }
		if (t.type === 'string' && !t.closed) error(t, 'String is not enclosed in double quotes.', 'unterminated-string');
		const top = blocks[blocks.length - 1];
		if (punct(t, '{')) {
			// Modifiers may precede a control keyword: persistent(2) while ... { ... }.
			const control = segment.find(x => ['if', 'else', 'for', 'while', 'switch'].includes(word(x)));
			const kind = control ? (['for', 'while'].includes(word(control)) ? 'loop' : word(control)) :
				(segment.length === 1 && segment[0].type === 'ident' && !['ignorehitpause'].includes(word(segment[0])) ? 'controller' : 'block');
			blocks.push({ token: t, kind, hasDefault: false });
			segment = [];
			parens = 0;
			continue;
		}
		if (punct(t, '}')) {
			if (blocks.length) blocks.pop();
			else error(t, "Unexpected '}' without an open block.", 'unexpected-closing-brace');
			segment = [];
			parens = 0;
			continue;
		}
		if (top && top.kind === 'controller') continue;
		if (!segment.length && word(t) === 'default' && top && top.kind === 'switch') {
			if (top.hasDefault) error(t, 'Default is already defined in this switch.', 'duplicate-default');
			top.hasDefault = true;
			continue; // default has no ':' in ZSS.
		}
		if (!segment.length && ['break', 'continue'].includes(word(t)) && !blocks.some(b => b.kind === 'loop')) {
			error(t, "'" + t.text + "' can only be used inside a loop.", 'loop-control-outside-loop');
		}
		if (punct(t, '(')) parens++;
		if (punct(t, ')')) parens = Math.max(0, parens - 1);
		if (punct(t, ':') && parens === 0 && word(segment[0]) === 'case' && top && top.kind === 'switch') {
			segment = [];
			continue;
		}
		if (punct(t, ';') && parens === 0) {
			if (word(segment[0]) === 'let') {
				const eq = segment.findIndex(x => punct(x, '='));
				if (eq !== -1) duplicateNames(names(segment.slice(1, eq)));
			}
			if (!segment.some(x => word(x) === 'for') && !(word(segment[0]) === 'case' && top && top.kind === 'switch')) segment = [];
		} else segment.push(t);
	}
	endSection();
}

module.exports = { headerEnd, checkStructure };
