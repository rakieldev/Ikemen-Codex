'use strict';

// Builds ZSS suggestion descriptors from the generated data. No VS Code dependency.

const { getContext, getHoverTarget, declaredFunctions } = require('./context');
const { sctrlDoc, paramDoc, triggerDoc, originLabel } = require('../shared/markdown');
const { esc, hasOptional, isTemplateParam } = require('../shared/snippets');

// ZSS syntax confirmed by real code: if / for / let blocks and ignoreHitPause { }.
const KEYWORDS = [
	{ label: 'if', insert: 'if ${1:condition} {\n\t$0\n}', doc: 'Runs the block when the condition is true.' },
	{ label: 'for', insert: 'for ${1:i} = ${2:0}; ${3:count}; ${4:1} {\n\t$0\n}', doc: 'Loop: `for var = start; end; step { ... }`.' },
	{ label: 'let', insert: 'let ${1:name} = ${2:value};', doc: 'Declares a local variable. Read it later as `$name`.' },
	{ label: 'ignoreHitPause', insert: 'ignoreHitPause {\n\t$0\n}', doc: 'Keeps running the statements inside the block during hit pause.' },
	{ label: 'else', insert: 'else', doc: 'Alternative branch of an `if`.' },
	{ label: 'while', insert: 'while', doc: 'Loop keyword.' },
	{ label: 'switch', insert: 'switch', doc: 'Switch keyword.' },
	{ label: 'call', insert: 'call', doc: 'Calls a `[Function ...]` declared in a .zss file.' },
	{ label: 'break', insert: 'break', doc: 'Leaves the current loop.' },
	{ label: 'continue', insert: 'continue', doc: 'Skips to the next loop iteration.' }
];
const SNIPPET_KEYWORDS = new Set(['if', 'for', 'let', 'ignoreHitPause']);

// ModifyExplod -> modifyExplod, BGPalFX -> bgPalFX, AILevel -> aiLevel, P2Dist -> p2Dist
function camelCase(name) {
	const m = /^[A-Z]+/.exec(name);
	if (!m) return name;
	let run = m[0];
	// keep the last capital when it starts a lowercase word (BGPalFX -> bg + PalFX)
	if (run.length > 1 && /^[a-z]/.test(name.slice(run.length))) run = run.slice(0, -1);
	return run.toLowerCase() + name.slice(run.length);
}

// velSet {x: ${1:x}}  -- required parameters only, one line
function template(s, name) {
	let n = 0;
	const req = s.params.filter(p => p.required && !p.deprecated && !p.aliasOf);
	const body = req.map(p => p.name + ': ${' + (++n) + ':' + esc(p.placeholder || p.name) + '}').join('; ');
	return esc(name) + ' {' + (body || '${1}') + '}$0';
}

// Multi-line block: required parameters as tab stops, optional ones commented out with #
function fullTemplate(s, name) {
	const usable = s.params.filter(isTemplateParam);
	let n = 0;
	const lines = [esc(name) + ' {'];
	const req = usable.filter(p => p.required);
	for (const p of req) lines.push('\t' + p.name + ': ${' + (++n) + ':' + esc(p.placeholder || p.name) + '};' +
		(p.nightly ? ' # (nightly build only)' : ''));
	for (const p of usable.filter(x => !x.required)) {
		const cursor = !req.length && lines.length === 1 ? '$0' : '';
		lines.push('\t' + cursor + '#' + p.name + ': ' + esc(p.placeholder || '') + ';' +
			(p.nightly ? ' # (nightly build only)' : ''));
	}
	lines.push('}');
	return lines.join('\n') + (req.length ? '$0' : '');
}

// getStyle: optional function returning 'camelCase' (default) or 'documentation'
function createZssEngine(sctrlList, triggerList, getStyle) {
	const sctrlByKey = new Map(sctrlList.map(s => [s.key, s]));
	const triggerByKey = new Map(triggerList.map(t => [t.key, t]));

	function triggerItems(fmt) {
		return triggerList.map(t => ({
			kind: 'trigger',
			label: fmt(t.name),
			detail: t.format || t.signature || 'trigger',
			documentation: triggerDoc(t),
			insertText: fmt(t.name),
			isSnippet: false,
			sortText: (t.deprecated ? '1_' : '0_') + t.key,
			deprecated: t.deprecated
		}));
	}

	function statementItems(canExpand, fmt) {
		const items = [];
		for (const s of sctrlList) {
			const name = fmt(s.name);
			const detail = 'State controller' + (originLabel(s) ? ' · ' + originLabel(s) : '');
			const sortBase = (s.deprecated ? '1_' : '0_') + s.key;
			items.push({
				kind: 'sctrl', label: name, detail, documentation: sctrlDoc(s),
				insertText: canExpand ? template(s, name) : name, isSnippet: canExpand,
				sortText: sortBase + '_0', deprecated: s.deprecated
			});
			if (canExpand && hasOptional(s)) {
				items.push({
					kind: 'sctrl', label: name + ' (all parameters)', filterText: name,
					detail: detail + ' · optional parameters commented out', documentation: sctrlDoc(s),
					insertText: fullTemplate(s, name), isSnippet: true,
					sortText: sortBase + '_1', deprecated: s.deprecated
				});
			}
		}
		for (const k of KEYWORDS) {
			const snippet = canExpand && SNIPPET_KEYWORDS.has(k.label);
			items.push({
				kind: 'keyword', label: k.label, detail: 'keyword', documentation: k.doc,
				insertText: snippet ? k.insert : k.label, isSnippet: snippet,
				sortText: '2_' + k.label, deprecated: false
			});
		}
		return items;
	}

	function paramItems(ctx, rest) {
		const s = sctrlByKey.get(ctx.sctrl);
		if (!s) return [];
		const addSemicolon = rest.trim() === '';
		const items = [];
		for (const p of s.params) {
			if (ctx.keys.has(p.key)) continue;
			let rank = '1_';
			if (p.required) rank = '0_';
			else if (p.inferred) rank = '2_';
			if (p.deprecated) rank = '3_';
			items.push({
				kind: 'param',
				label: p.name,
				detail: (p.type || 'parameter') + (p.required ? ' · required' : ''),
				documentation: paramDoc(p),
				insertText: p.name + ': ${1' + (p.placeholder ? ':' + esc(p.placeholder) : '') + '}' + (addSemicolon ? ';' : ''),
				isSnippet: true,
				sortText: rank + p.key,
				deprecated: p.deprecated
			});
		}
		return items;
	}

	function functionItems(text, offset, functions) {
		// Preserve an existing argument list or terminator after the completed word.
		const after = text.slice(offset).replace(/^[\w.]*/, '').replace(/^(?:\s|#[^\n]*(?:\n|$))*/, '');
		const hasArgs = after.startsWith('(');
		return (functions || declaredFunctions(text)).map(f => {
			const args = f.params.map((p, i) => '${' + (i + 1) + ':' + esc(p) + '}').join(', ');
			return {
				kind: 'function',
				label: f.name,
				detail: '(' + f.params.join(', ') + ')',
				documentation: '**' + f.name + '**(' + f.params.join(', ') + ')\n\n' + (f.source ? 'Function declared in `' + f.source.replace(/`/g, '') + '`.' : 'Function declared in this file.'),
				insertText: hasArgs ? f.name : f.name + '(' + args + ')' + (after.startsWith(';') ? '' : ';'),
				isSnippet: !hasArgs,
				sortText: '0_' + f.name.toLowerCase(),
				deprecated: false
			};
		});
	}

	function complete(text, offset, functions) {
		const ctx = getContext(text, offset);
		const eol = text.indexOf('\n', offset);
		const rest = text.slice(offset, eol === -1 ? text.length : eol);

		const fmt = (getStyle ? getStyle() : 'camelCase') === 'camelCase' ? camelCase : n => n;

		if (ctx.kind === 'statement') {
			// Expand into a full block only when nothing follows the cursor on the line
			return statementItems(rest.trim() === '', fmt);
		}
		if (ctx.kind === 'param') return paramItems(ctx, rest);
		if (ctx.kind === 'expression') return triggerItems(fmt);
		if (ctx.kind === 'call') return functionItems(text, offset, functions);
		return [];
	}

	// Returns { markdown, start, end } (offsets) or null
	function hover(text, offset) {
		const t = getHoverTarget(text, offset);
		if (!t) return null;
		let md = null;
		if (t.kind === 'sctrl') {
			const s = sctrlByKey.get(t.name.toLowerCase());
			if (s) md = '**' + s.name + '** — state controller' + (originLabel(s) ? ' (' + originLabel(s) + ')' : '') + '\n\n' + sctrlDoc(s);
		} else if (t.kind === 'param') {
			const s = sctrlByKey.get(t.sctrl);
			const p = s && s.params.find(x => x.key === t.name.toLowerCase());
			if (p) md = paramDoc(p);
		} else if (t.kind === 'trigger') {
			const tr = triggerByKey.get(t.name.toLowerCase());
			if (tr) md = '**' + tr.name + '** — trigger' + (originLabel(tr) ? ' (' + originLabel(tr) + ')' : '') + '\n\n' + triggerDoc(tr);
		}
		return md ? { markdown: md, start: t.start, end: t.end } : null;
	}

	return { complete, hover };
}

module.exports = { createZssEngine, camelCase };
