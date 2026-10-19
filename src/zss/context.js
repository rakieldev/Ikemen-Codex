'use strict';

// Pure helpers (no VS Code dependency) that work out WHERE the cursor is inside
// a ZSS file. ZSS is block based, so instead of line regexes this walks the text
// once, tracking strings, comments, parentheses and the stack of open "{" blocks.
//
// Two kinds of blocks matter:
//   sctrl   -> a state controller call:  velSet{ x: 1; y: 2 }   (parameters live inside)
//   control -> if / else / for / ignoreHitPause { ... }          (statements live inside)

const { headerEndOffset } = require('./header');

// Words that open a control block, never a controller call.
const CONTROL_WORDS = new Set([
	'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'ignorehitpause', 'persistent', 'loop'
]);
const BOUNDARY = ';{}]';

// Walks the text from 0 to `offset` and returns the parser state at that point.
function analyze(text, offset) {
	const stack = [];
	let inString = false;
	let inComment = false;
	let atLineStart = true;
	let paren = 0;
	let segStart = 0;          // start of the current statement/parameter
	let prevSig = '';          // last significant character before the current token
	let lastIdent = null;      // identifier that is the last significant token so far
	let forHeader = false;     // inside "for a; b; c {": its ';' are not statement ends

	let i = 0;
	while (i < offset) {
		const c = text[i];

		if (inComment) {
			if (c === '\n') { inComment = false; atLineStart = true; }
			i++;
			continue;
		}
		if (inString) {
			if (c === '"') { inString = false; prevSig = '"'; }
			else if (c === '\n') { inString = false; atLineStart = true; }
			i++;
			continue;
		}
		if (c === '\n') { atLineStart = true; i++; continue; }
		if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

		// [StateDef ...] / [Function ...] headers (possibly several lines) are not code
		if (atLineStart && c === '[') {
			const header = headerEndOffset(text, i);
			if (header.end >= offset) return { inHeader: true };
			i = header.closed ? header.end + 1 : header.end;
			atLineStart = false;
			prevSig = ']';
			segStart = i;
			paren = 0;
			lastIdent = null;
			forHeader = false;
			continue;
		}
		atLineStart = false;

		if (c === '#') { inComment = true; i++; continue; }
		if (c === '"') { inString = true; lastIdent = null; i++; continue; }

		if (/[A-Za-z_0-9$]/.test(c)) {
			let j = i;
			while (j < offset && /[\w.$]/.test(text[j])) j++;
			const word = text.slice(i, j);
			if (/^[A-Za-z_]/.test(word)) {
				lastIdent = { text: word, start: i, before: prevSig };
				if (word.toLowerCase() === 'for' && (prevSig === '' || BOUNDARY.includes(prevSig))) forHeader = true;
			} else {
				lastIdent = null;   // number or $variable
			}
			prevSig = 'a';
			i = j;
			continue;
		}

		if (c === '{') {
			let kind = 'control';
			let name = '';
			if (lastIdent && !CONTROL_WORDS.has(lastIdent.text.toLowerCase()) &&
					(lastIdent.before === '' || BOUNDARY.includes(lastIdent.before))) {
				kind = 'sctrl';
				name = lastIdent.text;
			}
			stack.push({ kind, name, open: i });
			segStart = i + 1;
			paren = 0;
			forHeader = false;
		} else if (c === '}') {
			stack.pop();
			segStart = i + 1;
			paren = 0;
		} else if (c === ';') {
			if (paren === 0 && !forHeader) segStart = i + 1;
		} else if (c === '(') {
			paren++;
		} else if (c === ')') {
			paren = Math.max(0, paren - 1);
		}
		prevSig = c;
		lastIdent = null;
		i++;
	}

	return {
		inString,
		inComment,
		inHeader: false,
		stack,
		top: stack.length ? stack[stack.length - 1] : null,
		paren,
		segment: text.slice(segStart, offset)
	};
}

function stripComments(s, maskStrings = false) {
	let inString = false;
	let inComment = false;
	let out = '';
	for (const c of s) {
		if (c === '\n') {
			inString = false;
			inComment = false;
			out += c;
			continue;
		}
		if (inComment) { out += ' '; continue; }
		if (c === '"') {
			inString = !inString;
			out += maskStrings ? ' ' : c;
		} else if (!inString && c === '#') {
			inComment = true;
			out += ' ';
		} else {
			out += inString && maskStrings ? ' ' : c;
		}
	}
	return out;
}

// Index of the "}" that closes the block we are in (or end of text).
function blockEnd(text, from) {
	let depth = 0;
	let inStr = false;
	let inCom = false;
	for (let i = from; i < text.length; i++) {
		const c = text[i];
		if (inCom) { if (c === '\n') inCom = false; continue; }
		if (inStr) { if (c === '"' || c === '\n') inStr = false; continue; }
		if (c === '#') inCom = true;
		else if (c === '"') inStr = true;
		else if (c === '{') depth++;
		else if (c === '}') { if (depth === 0) return i; depth--; }
	}
	return text.length;
}

// Parameter names already written inside the block that opens at `open`.
function keysInBlock(text, open) {
	const body = stripComments(text.slice(open + 1, blockEnd(text, open + 1)), true);
	const keys = new Set();
	const re = /([A-Za-z_][\w.]*)\s*:(?!=)/g;
	let m;
	while ((m = re.exec(body))) keys.add(m[1].toLowerCase());
	return keys;
}

// [Function Name(a, b)] declarations in this file.
function declaredFunctions(text) {
	const out = [];
	const re = /^\s*\[\s*function\s+([A-Za-z_][\w.]*)\s*(?:\(([^)]*)\))?\s*(?:[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\s*\]/gim;
	let m;
	const code = stripComments(text);
	while ((m = re.exec(code))) {
		const params = (m[2] || '').split(',').map(s => s.trim()).filter(Boolean);
		out.push({ name: m[1], params });
	}
	return out;
}

// What kind of suggestion makes sense at `offset`?
function getContext(text, offset) {
	const a = analyze(text, offset);
	if (a.inHeader || a.inString || a.inComment) return { kind: 'none' };

	const clean = stripComments(a.segment);
	const typing = /^\s*[A-Za-z_]?[\w.]*$/.test(clean);

	if (a.top && a.top.kind === 'sctrl') {
		if (a.paren === 0 && typing) {
			return { kind: 'param', sctrl: a.top.name.toLowerCase(), keys: keysInBlock(text, a.top.open) };
		}
		return { kind: 'expression' };
	}
	if (/^\s*(?:let\s+[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*=\s*)?call\s+[\w.]*$/i.test(clean)) return { kind: 'call' };
	if (a.paren === 0 && typing) return { kind: 'statement' };
	return { kind: 'expression' };
}

// What is under the cursor? (for hover)
function getHoverTarget(text, offset) {
	let s = offset;
	while (s > 0 && /[\w.]/.test(text[s - 1])) s--;
	let e = offset;
	while (e < text.length && /[\w.]/.test(text[e])) e++;
	const word = text.slice(s, e);
	if (!/^[A-Za-z_]/.test(word) || text[s - 1] === '$') return null;

	const a = analyze(text, s);
	if (a.inHeader || a.inString || a.inComment) return null;

	const after = text.slice(e).match(/^[ \t]*(\{|:(?!=))?/)[1] || '';
	const typedBefore = stripComments(a.segment).trim() === '';

	if (after === '{' && typedBefore && !CONTROL_WORDS.has(word.toLowerCase())) {
		return { kind: 'sctrl', name: word, start: s, end: e };
	}
	if (after === ':' && typedBefore && a.top && a.top.kind === 'sctrl') {
		return { kind: 'param', name: word, sctrl: a.top.name.toLowerCase(), start: s, end: e };
	}
	if (after !== ':') return { kind: 'trigger', name: word, start: s, end: e };
	return null;
}

module.exports = { analyze, getContext, getHoverTarget, declaredFunctions, keysInBlock };
