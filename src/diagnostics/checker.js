'use strict';

// Pure diagnostics (no VS Code dependency) for character code: CNS-style files
// (.cns/.cmd/.st) and ZSS.
//
// The scope is intentionally small. It reports only:
//   1. a parameter set twice inside the same controller
//   2. an unknown state controller name
//   3. an unknown trigger name (in conditions and trigger lines)
//   4. missing ZSS semicolons and local structural errors
// Parameter names and parameter VALUES are not checked: the documentation is
// incomplete there (aliases like "velocity", parameter lists shared with HitDef,
// nightly-only syntax, empty values the engine accepts...).

const { headerEnd, checkStructure } = require('./zss-structure');
const { NAME_FUNCTIONS } = require('../shared/nameFunctions');

// Redirections live on a separate documentation page that the generator does not read.
const REDIRECTIONS = [
	'enemy', 'enemynear', 'helper', 'helperindex', 'p2', 'parent', 'partner',
	'player', 'playerid', 'playerindex', 'root', 'stateowner', 'target'
];

// Functions whose parentheses hold names/specifiers, not expressions (see nameFunctions.js)
const ARG_NAME_FUNCS = new Set(NAME_FUNCTIONS);

// ZSS words that open a block of statements instead of a controller call
const BLOCK_WORDS = new Set(['switch', 'case', 'default', 'ignorehitpause', 'persistent', 'loop']);

const LITERAL_WORDS = new Set(['true', 'false']);
const TEAM_MODES = new Set(['tag', 'simul', 'single', 'turns']);

// Words that can only start a new statement
const STATEMENT_WORDS = new Set(['if', 'for', 'while', 'let', 'call']);

const RE_STATE_HEADER = /^\s*\[\s*state\s+[^\]]*\]/i;

// ---------- helpers ----------

// Optimal string alignment distance (insert, delete, replace, swap neighbours)
function distance(a, b) {
	const d = [];
	for (let i = 0; i <= a.length; i++) d[i] = [i];
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

// Closest name within a small edit distance, or null
function suggest(word, names) {
	const w = word.toLowerCase();
	const limit = w.length <= 3 ? 1 : w.length <= 7 ? 2 : 3;
	let best = null;
	let bestDistance = limit + 1;
	for (const n of names) {
		if (Math.abs(n.length - w.length) > limit) continue;
		const dist = distance(w, n.toLowerCase());
		if (dist < bestDistance) { best = n; bestDistance = dist; }
	}
	return best;
}

// Words that are valid inside expressions without being triggers:
// state/move/physics types, hit attributes (SCA, NA, HP...), axes, S1/F5 style prefixes.
function looksLikeConstant(w) {
	return /^[scalunhxyzef]$/.test(w) ||
		/^[sca]{2,3}$/.test(w) ||
		/^[nsh][atp]$/.test(w) ||
		/^[sf]\d+$/.test(w);
}

// ---------- tokenizer ----------

// Splits text into tokens: ident, number, string, var ($x), punct.
// Offsets are relative to `str`.
function tokenize(str, opts) {
	const tokens = [];
	const n = str.length;
	let i = 0;
	let atLineStart = true;

	while (i < n) {
		const c = str[i];
		if (c === '\n') { atLineStart = true; i++; continue; }
		if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

		// ZSS [StateDef ...] / [Function ...] headers (possibly several lines) are not code
		if (opts.headers && atLineStart && c === '[' && /^\[\s*(?:statedef|function)\b/i.test(str.slice(i))) {
			const header = headerEnd(str, i);
			const bodyEnd = header.closed ? header.end - 1 : header.end;
			const inner = tokenize(str.slice(i + 1, bodyEnd), { hash: true })
				.map(t => Object.assign(t, { start: t.start + i + 1, end: t.end + i + 1 }));
			tokens.push({ type: 'header', text: str.slice(i, header.end), start: i, end: header.end,
				closed: header.closed, tokens: inner });
			i = header.end;
			atLineStart = false;
			continue;
		}
		atLineStart = false;

		if (opts.hash && c === '#') {
			while (i < n && str[i] !== '\n') i++;
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			while (j < n && str[j] !== '"' && str[j] !== '\n' && str[j] !== '\r') j++;
			const end = str[j] === '"' ? j + 1 : j;
			tokens.push({ type: 'string', text: str.slice(i, end), start: i, end, closed: str[j] === '"' });
			i = end;
			continue;
		}
		if (c === '$' && /[A-Za-z_]/.test(str[i + 1] || '')) {
			let j = i + 1;
			while (j < n && /[\w.]/.test(str[j])) j++;
			tokens.push({ type: 'var', text: str.slice(i, j), start: i, end: j });
			i = j;
			continue;
		}
		if (/[A-Za-z_]/.test(c)) {
			let j = i + 1;
			while (j < n && /[\w.]/.test(str[j])) j++;
			tokens.push({ type: 'ident', text: str.slice(i, j), start: i, end: j });
			i = j;
			continue;
		}
		if (/\d/.test(c) || (c === '.' && /\d/.test(str[i + 1] || ''))) {
			let j = i + 1;
			while (j < n && /[\w.]/.test(str[j])) j++;
			tokens.push({ type: 'number', text: str.slice(i, j), start: i, end: j });
			i = j;
			continue;
		}
		const two = str.slice(i, i + 2);
		if ([':=', '!=', '<=', '>=', '&&', '||', '^^', '**'].includes(two)) {
			tokens.push({ type: 'punct', text: two, start: i, end: i + 2 });
			i += 2;
			continue;
		}
		tokens.push({ type: 'punct', text: c, start: i, end: i + 1 });
		i++;
	}
	return tokens;
}

function skipParens(tokens, i) {
	// tokens[i] is "(": returns the index right after the matching ")"
	let depth = 0;
	for (; i < tokens.length; i++) {
		if (tokens[i].type !== 'punct') continue;
		if (tokens[i].text === '(') depth++;
		else if (tokens[i].text === ')') { depth--; if (depth === 0) return i + 1; }
	}
	return tokens.length;
}

// ---------- the checker ----------

// Options accepted by checkCns / checkZss:
//   triggers:     report unknown trigger names (default true)
//   semicolons:   report a missing ";" in ZSS (default true)
//   ignoredNames: names (controllers or triggers) that must never be reported
function createChecker(sctrlList, triggerList) {
	const sctrlKeys = new Set(sctrlList.map(s => s.key));
	const sctrlNames = sctrlList.map(s => s.name);

	const known = new Set(LITERAL_WORDS);
	for (const t of triggerList) known.add(t.key);
	for (const r of REDIRECTIONS) known.add(r);
	const triggerNames = triggerList.map(t => t.name).concat(REDIRECTIONS);

	function normalize(opts) {
		const o = Object.assign({ triggers: true, semicolons: true, ignoredNames: [] }, opts);
		o.ignored = new Set((o.ignoredNames || []).map(n => String(n).toLowerCase()));
		return o;
	}

	function reportUnknownController(tok, o, report) {
		const w = tok.text.toLowerCase();
		if (sctrlKeys.has(w) || o.ignored.has(w)) return;
		const hint = suggest(tok.text, sctrlNames);
		report(tok, tok, 'warning',
			"Unknown state controller '" + tok.text + "'." + (hint ? " Did you mean '" + hint + "'?" : ''),
			'unknown-controller');
	}

	// Identifiers in an expression must be triggers, redirections or well-known constants.
	// A lone word that is a whole function argument is NOT checked: it is usually a name
	// or flag the documentation only describes in prose (gameVar(superpausetime),
	// isAsserted(Intro)). Words inside larger expressions, like ifElse(Tiem = 0, 1, 0), still are.
	function checkIdentifiers(tokens, o, report) {
		if (!o.triggers) return;
		const calls = [];      // one entry per open "(": true when it belongs to a function call
		let i = 0;
		while (i < tokens.length) {
			const t = tokens[i];
			const prev = tokens[i - 1];
			const next = tokens[i + 1];

			if (t.type === 'punct') {
				if (t.text === '(') calls.push(!!prev && prev.type === 'ident');
				else if (t.text === ')') calls.pop();
			} else if (t.type === 'ident') {
				const w = t.text.toLowerCase();
				if (ARG_NAME_FUNCS.has(w) && next && next.type === 'punct' && next.text === '(') {
					i = skipParens(tokens, i + 1);
					continue;
				}
				const loneArgument = calls.length > 0 && calls[calls.length - 1] &&
					prev && prev.type === 'punct' && (prev.text === '(' || prev.text === ',') &&
					next && next.type === 'punct' && (next.text === ')' || next.text === ',');

				// Legacy TeamMode syntax uses bare mode names, not trigger identifiers.
				const comparison = tokens[i - 2];
				const teamModeValue = TEAM_MODES.has(w) && comparison && comparison.type === 'ident' &&
					comparison.text.toLowerCase() === 'teammode' && prev && prev.type === 'punct' &&
					(prev.text === '=' || prev.text === '!=');

				if (!teamModeValue && !loneArgument && !w.includes('.') && !known.has(w) && !o.ignored.has(w) && !looksLikeConstant(w)) {
					const hint = suggest(t.text, triggerNames);
					report(t, t, 'warning',
						"Unknown trigger or constant '" + t.text + "'." +
						(hint ? " Did you mean '" + hint + "'?" : ' It is not in the documentation data.'),
						'unknown-trigger');
				}
			}
			i++;
		}
	}

	// ----- CNS (.cns/.cmd/.st): only inside [State ...] blocks -----

	function stripComment(line) {
		let inString = false;
		for (let i = 0; i < line.length; i++) {
			if (line[i] === '"') inString = !inString;
			else if (line[i] === ';' && !inString) return line.slice(0, i);
		}
		return line;
	}

	function checkCns(text, opts) {
		const o = normalize(opts);
		const lines = text.split(/\r?\n/);
		const out = [];
		const report = (a, b, severity, message, code) => {
			out.push({ sl: a.line, sc: a.start, el: b.line, ec: b.end, severity, message, code });
		};

		let l = 0;
		while (l < lines.length) {
			if (!RE_STATE_HEADER.test(lines[l])) { l++; continue; }
			let end = l + 1;
			while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
			checkCnsBlock(lines, l + 1, end - 1, o, report);
			l = end;
		}
		return out;
	}

	function checkCnsBlock(lines, from, to, o, report) {
		const seen = new Map();
		for (let l = from; l <= to; l++) {
			const code = stripComment(lines[l]);
			const m = /^(\s*)([A-Za-z_][\w.]*(?:\([^)\n]*\))?)(\s*=\s*)(.*?)\s*$/.exec(code);
			if (!m) continue;

			const keyStart = m[1].length;
			const keyEnd = keyStart + m[2].length;
			const valueStart = keyEnd + m[3].length;
			const keyTok = { text: m[2], line: l, start: keyStart, end: keyEnd };
			const key = m[2].toLowerCase().replace(/\s+/g, '');
			const tokens = tokenize(m[4], {}).map(t => Object.assign(t, {
				line: l, start: t.start + valueStart, end: t.end + valueStart
			}));

			// trigger1, trigger2, triggerall may repeat; everything else may not
			const isTrigger = /^trigger(all|\d+)$/.test(key);
			if (!isTrigger) {
				if (seen.has(key)) {
					report(keyTok, keyTok, 'warning',
						"Duplicate parameter '" + m[2] + "' (first set on line " + (seen.get(key) + 1) + ').',
						'duplicate-parameter');
				} else {
					seen.set(key, l);
				}
			}

			if (key === 'type') {
				if (tokens.length && tokens[0].type === 'ident') reportUnknownController(tokens[0], o, report);
			} else if (isTrigger) {
				checkIdentifiers(tokens, o, report);
			}
		}
	}

	// ----- ZSS -----

	function checkZss(text, opts) {
		const o = normalize(opts);
		const out = [];

		const starts = [0];
		for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
		const posAt = off => {
			let lo = 0;
			let hi = starts.length - 1;
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				if (starts[mid] <= off) lo = mid; else hi = mid - 1;
			}
			return { line: lo, col: off - starts[lo] };
		};
		const report = (a, b, severity, message, code) => {
			const s = posAt(a.start);
			const e = posAt(b.end);
			out.push({ sl: s.line, sc: s.col, el: e.line, ec: e.col, severity, message, code });
		};

		const tokens = tokenize(text, { hash: true, headers: true });
		checkStructure(tokens, report);
		let p = 0;

		const isPunct = (t, s) => !!t && t.type === 'punct' && t.text === s;

		const missingSemicolon = (tok, message) => {
			if (tok.type === 'string' && !tok.closed) return;
			if (o.semicolons) report(tok, tok, 'error', message || "Missing ';' at the end of this statement.", 'missing-semicolon');
		};

		// True when tokens[i] begins a new statement: a statement keyword
		// (if, for, let...) or a controller call (name {). Seeing one inside an unfinished
		// statement means the previous statement has no ";".
		function startsNewStatement(i) {
			const t = tokens[i];
			const prev = tokens[i - 1];
			if (!prev || t.type !== 'ident') return false;
			// A function call can also be the right-hand side of a let declaration.
			if (t.text.toLowerCase() === 'call' && isPunct(prev, '=')) return false;
			return STATEMENT_WORDS.has(t.text.toLowerCase()) || isPunct(tokens[i + 1], '{');
		}

		// Tokens of a statement header up to "{" / "}" (and ";" unless allowSemi). Does not consume the stop token.
		function collectHeader(allowSemi, stopAtStatement) {
			const list = [];
			let depth = 0;
			while (p < tokens.length) {
				const t = tokens[p];
				if (t.type === 'header') break;
				if (stopAtStatement && list.length && depth === 0 && startsNewStatement(p)) {
					break;
				}
				if (t.type === 'punct') {
					if (t.text === '(') depth++;
					else if (t.text === ')') depth = Math.max(0, depth - 1);
					else if (t.text === '{' || t.text === '}') break;
					else if (t.text === ';' && depth === 0 && !allowSemi) break;
				}
				list.push(t);
				p++;
			}
			return list;
		}

		// if / else if / while / for: check the condition, then parse the block
		function parseCondition(allowSemi, skipLoopVariable) {
			let list = collectHeader(allowSemi);
			if (skipLoopVariable && list.length && list[0].type === 'ident') list = list.slice(1);
			checkIdentifiers(list, o, report);
			if (isPunct(tokens[p], '{')) {
				p++;
				parseBody();
			}
		}

		// Skips an unrecognised statement up to ";" (consumed) or a brace (left in place)
		function skipStatement(needsSemicolon = false) {
			const list = collectHeader(false, true);
			if (isPunct(tokens[p], ';')) { p++; return; }
			if (list.length && (needsSemicolon || list.some(t => isPunct(t, ':=')))) {
				missingSemicolon(list[list.length - 1]);
			}
		}

		// After a block keyword (switch, ignoreHitPause...): skip its header, then parse the block
		function skipToBlock() {
			let depth = 0;
			while (p < tokens.length) {
				const t = tokens[p];
				if (t.type === 'header') return;
				if (t.type === 'punct') {
					if (t.text === '(') depth++;
					else if (t.text === ')') depth = Math.max(0, depth - 1);
					else if (t.text === '{') { p++; parseBody(); return; }
					else if (t.text === '}') return;
					else if (t.text === ';' && depth === 0) { p++; return; }
				}
				p++;
			}
		}

		// name { key: value; key: value }
		function parseController(nameTok) {
			reportUnknownController(nameTok, o, report);
			p += 2;                    // controller name and "{"

			const seen = new Set();
			while (p < tokens.length) {
				const t = tokens[p];
				if (t.type === 'header') return;
				if (isPunct(t, '}')) { p++; return; }

				if (t.type === 'ident' && isPunct(tokens[p + 1], ':')) {
					const key = t.text.toLowerCase();
					if (seen.has(key)) {
						report(t, t, 'warning', "Duplicate parameter '" + t.text + "'.", 'duplicate-parameter');
					} else {
						seen.add(key);
					}
					// skip the value: up to ";" at depth 0 or the closing "}"
					p += 2;
					let depth = 0;
					let last = null;
					while (p < tokens.length) {
						const x = tokens[p];
						if (x.type === 'header') break;
						if (isPunct(x, '}')) break;
						if (x.type === 'punct') {
							if (x.text === '(') depth++;
							else if (x.text === ')') depth = Math.max(0, depth - 1);
							else if (x.text === ';' && depth === 0) break;
						}
						// the next parameter starts here, so the previous one has no ";"
						if (depth === 0 && x.type === 'ident' && isPunct(tokens[p + 1], ':')) {
							missingSemicolon(last || t, "Missing ';' after the value of '" + t.text + "'.");
							break;
						}
						last = x;
						p++;
					}
					continue;
				}
				p++;
			}
		}

		// Statements until the matching "}" (or the end of the file)
		function parseBody(root = false) {
			while (p < tokens.length) {
				const t = tokens[p];
				if (t.type === 'header') { if (!root) return; p++; continue; }
				if (isPunct(t, '}')) { p++; if (root) continue; return; }
				if (isPunct(t, ';')) { p++; continue; }
				if (isPunct(t, '{')) { p++; parseBody(); continue; }
				if (t.type === 'var') { skipStatement(); continue; }
				if (t.type !== 'ident') { p++; continue; }

				const w = t.text.toLowerCase();
				if (w === 'if' || w === 'while') { p++; parseCondition(false, false); continue; }
				if (w === 'else') {
					p++;
					if (tokens[p] && tokens[p].type === 'ident' && tokens[p].text.toLowerCase() === 'if') p++;
					parseCondition(false, false);
					continue;
				}
				if (w === 'for') { p++; parseCondition(true, true); continue; }
				if (w === 'let') {
					p++;
					if (tokens[p] && tokens[p].type === 'ident') p++;      // variable name
					while (isPunct(tokens[p], ',') && tokens[p + 1] && tokens[p + 1].type === 'ident') p += 2;
					const list = collectHeader(false, true);
					while (list.length && list[0].type === 'punct' && (list[0].text === '=' || list[0].text === ':=')) list.shift();
					if (!list.length || list[0].text.toLowerCase() !== 'call') checkIdentifiers(list, o, report);
					if (isPunct(tokens[p], ';')) p++;
					else missingSemicolon(tokens[p - 1] || t);
					continue;
				}
				if (w === 'call') { p++; skipStatement(true); continue; }
				if (BLOCK_WORDS.has(w)) { p++; skipToBlock(); continue; }
				if (isPunct(tokens[p + 1], '{')) { parseController(t); continue; }
				skipStatement();
			}
		}

		parseBody(true);
		return out;
	}

	return { checkCns, checkZss };
}

module.exports = { createChecker, suggest, distance };
