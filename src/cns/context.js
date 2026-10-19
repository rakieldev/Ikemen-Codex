'use strict';

// Pure helpers (no VS Code dependency) that work out WHERE the cursor is
// inside a CNS file, so the completion and hover code can decide what to show.

const RE_HEADER = /^\s*\[([^\]\n]*)\]/;
const RE_STATEDEF = /^\s*\[\s*statedef\b/i;
const RE_STATE = /^\s*\[\s*state\b/i;
const RE_TYPE = /^\s*type\s*=\s*([A-Za-z_]\w*)/i;
const RE_KEY = /^\s*([A-Za-z_][\w.]*)\s*=/;
const RE_TRIGGER_LINE = /^\s*(?:triggerall|trigger\d+)\s*=/i;

function isComment(text) {
	return text.trim().startsWith(';');
}

// Finds the [section] that contains `lineNo` and collects its `type` and keys.
// `skipLine` is ignored while scanning (the line being typed).
function sectionInfo(lines, lineNo, skipLine) {
	let start = -1;
	for (let i = lineNo; i >= 0; i--) {
		if (RE_HEADER.test(lines[i])) { start = i; break; }
	}
	if (start < 0) return { kind: 'none', start: -1, end: -1, type: null, keys: new Set() };

	let end = lines.length - 1;
	for (let i = Math.max(lineNo + 1, start + 1); i < lines.length; i++) {
		if (RE_HEADER.test(lines[i])) { end = i - 1; break; }
	}

	let kind = 'other';
	if (RE_STATEDEF.test(lines[start])) kind = 'statedef';
	else if (RE_STATE.test(lines[start])) kind = 'state';

	let type = null;
	const keys = new Set();
	for (let i = start + 1; i <= end; i++) {
		if (i === skipLine || isComment(lines[i])) continue;
		const t = RE_TYPE.exec(lines[i]);
		if (t && !type) type = t[1].toLowerCase();
		const k = RE_KEY.exec(lines[i]);
		if (k) keys.add(k[1].toLowerCase());
	}
	return { kind, start, end, type, keys };
}

function hasContentBelow(lines, lineNo, sec) {
	for (let i = lineNo + 1; i <= sec.end; i++) {
		if (lines[i].trim() !== '' && !isComment(lines[i])) return true;
	}
	return false;
}

// What kind of suggestion makes sense at this position?
function getContext(lines, line, character) {
	const text = lines[line] || '';
	const prefix = text.slice(0, character);
	const rest = text.slice(character);
	if (prefix.includes(';')) return { kind: 'none' };

	// Controllers, their parameters and triggers only exist inside [State ...]
	// blocks. Anything else (.def files, [Data], [Statedef]...) gets no suggestions.
	const sec = sectionInfo(lines, line, line);
	if (sec.kind !== 'state') return { kind: 'none' };

	if (/^\s*type\s*=\s*[A-Za-z_]?\w*$/i.test(prefix)) {
		const canExpand = rest.trim() === '' && !hasContentBelow(lines, line, sec);
		return { kind: 'sctrl-name', sec, canExpand };
	}
	if (RE_TRIGGER_LINE.test(prefix)) return { kind: 'trigger', sec };
	if (/^\s*[A-Za-z_]?[\w.]*$/.test(prefix)) return { kind: 'param', sec };
	return { kind: 'none' };
}

function wordAt(text, ch) {
	const re = /[A-Za-z_][\w.]*/g;
	let m;
	while ((m = re.exec(text))) {
		if (ch >= m.index && ch <= m.index + m[0].length) {
			return { word: m[0], start: m.index, end: m.index + m[0].length };
		}
	}
	return null;
}

// What is under the cursor? (for hover)
function getHoverTarget(lines, line, character) {
	const text = lines[line] || '';
	const semi = text.indexOf(';');
	if (semi >= 0 && character > semi) return null;

	const w = wordAt(text, character);
	if (!w) return null;
	const sec = sectionInfo(lines, line, -1);
	if (sec.kind !== 'state') return null;

	const km = /^(\s*)([A-Za-z_][\w.]*)\s*=/.exec(text);
	if (km) {
		const keyStart = km[1].length;
		const keyEnd = keyStart + km[2].length;
		const key = km[2].toLowerCase();
		if (character >= keyStart && character <= keyEnd) {
			if (key === 'type' || /^trigger(all|\d+)$/.test(key)) return null;
			return sec.type ? { kind: 'param', name: km[2], sctrl: sec.type, start: w.start, end: w.end } : null;
		}
		if (key === 'type') return { kind: 'sctrl', name: w.word, start: w.start, end: w.end };
		if (/^trigger(all|\d+)$/.test(key)) return { kind: 'trigger', name: w.word, start: w.start, end: w.end };
	}
	return null;
}

module.exports = { sectionInfo, getContext, getHoverTarget, wordAt };
