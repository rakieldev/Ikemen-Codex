'use strict';

// Builds plain "suggestion descriptors" from the generated data. No VS Code
// dependency, so it can be tested with plain Node.

const { getContext, getHoverTarget } = require('./context');
const { originLabel, sctrlDoc, paramDoc, triggerDoc } = require('../shared/markdown');
const { esc, hasOptional, isTemplateParam } = require('../shared/snippets');

const COMMON_KEYS = {
	triggerall: 'Condition that must be true for the controller to run. Every `triggerall` line must hold, in addition to at least one numbered trigger group.',
	persistent: 'Optional parameter shared by all state controllers. Controls how often the controller can trigger.',
	ignorehitpause: 'Optional parameter shared by all state controllers. When set to 1 the controller keeps running during hit pause.'
};

// Snippet used when a controller is chosen in an empty block: name + trigger1
// + every required parameter, each one a tab stop.
function template(s) {
	let n = 0;
	const out = [esc(s.name), 'trigger1 = ${' + (++n) + ':1}'];
	for (const p of s.params) {
		if (p.required && !p.deprecated && !p.aliasOf) {
			out.push(p.name + ' = ${' + (++n) + ':' + esc(p.placeholder || p.name) + '}');
		}
	}
	return out.join('\n') + '\n$0';
}

// Same as template(), plus every optional parameter as a commented-out line.
// Deprecated, alias and unreviewed inferred parameters are left out.
function fullTemplate(s) {
	let n = 0;
	const out = [esc(s.name), 'trigger1 = ${' + (++n) + ':1}'];
	const usable = s.params.filter(isTemplateParam);
	for (const p of usable.filter(x => x.required)) {
		out.push(p.name + ' = ${' + (++n) + ':' + esc(p.placeholder || p.name) + '}' +
			(p.nightly ? ' ; (nightly build only)' : ''));
	}
	for (const p of usable.filter(x => !x.required)) {
		out.push(';' + p.name + ' = ' + esc(p.placeholder || '') + (p.nightly ? ' ; (nightly build only)' : ''));
	}
	return out.join('\n') + '\n$0';
}

function createEngine(sctrlList, triggerList) {
	const sctrlByKey = new Map(sctrlList.map(s => [s.key, s]));
	const triggerByKey = new Map(triggerList.map(t => [t.key, t]));

	function sctrlItems(canExpand) {
		const items = [];
		for (const s of sctrlList) {
			const detail = 'State controller' + (originLabel(s) ? ' · ' + originLabel(s) : '');
			const sortBase = (s.deprecated ? '1_' : '0_') + s.key;
			items.push({
				kind: 'sctrl',
				label: s.name,
				detail,
				documentation: sctrlDoc(s),
				insertText: canExpand ? template(s) : s.name,
				isSnippet: canExpand,
				sortText: sortBase + '_0',
				deprecated: s.deprecated
			});
			if (canExpand && hasOptional(s)) {
				items.push({
					kind: 'sctrl',
					label: s.name + ' (all parameters)',
					filterText: s.name,
					detail: detail + ' · optional parameters commented out',
					documentation: sctrlDoc(s),
					insertText: fullTemplate(s),
					isSnippet: true,
					sortText: sortBase + '_1',
					deprecated: s.deprecated
				});
			}
		}
		return items;
	}

	function paramItems(sec) {
		const items = [];
		const sctrl = sec.type ? sctrlByKey.get(sec.type) : null;

		if (sctrl) {
			for (const p of sctrl.params) {
				if (sec.keys.has(p.key)) continue;
				let rank = '1_';
				if (p.required) rank = '0_';
				else if (p.inferred) rank = '2_';
				if (p.deprecated) rank = '3_';
				items.push({
					kind: 'param',
					label: p.name,
					detail: (p.type || 'parameter') + (p.required ? ' · required' : ''),
					documentation: paramDoc(p),
					insertText: p.placeholder ? p.name + ' = ${1:' + esc(p.placeholder) + '}' : p.name + ' = ${1}',
					isSnippet: true,
					sortText: rank + p.key,
					deprecated: p.deprecated
				});
			}
		}

		// Keys every controller accepts
		let next = 1;
		for (const k of sec.keys) {
			const m = /^trigger(\d+)$/.exec(k);
			if (m) next = Math.max(next, Number(m[1]) + 1);
		}
		const common = [
			['trigger' + next, 'Numbered trigger group. All lines in a group must hold; the controller runs when any group holds. `trigger1` is required.'],
			['triggerall', COMMON_KEYS.triggerall]
		];
		for (const key of ['persistent', 'ignorehitpause']) {
			if (!sec.keys.has(key)) common.push([key, COMMON_KEYS[key]]);
		}
		common.forEach(([name, doc], i) => items.push({
			kind: 'param',
			label: name,
			detail: 'common',
			documentation: doc,
			insertText: name + ' = ${1}',
			isSnippet: true,
			sortText: '4_' + i,
			deprecated: false
		}));
		return items;
	}

	function triggerItems() {
		return triggerList.map(t => ({
			kind: 'trigger',
			label: t.name,
			detail: t.format || t.signature || 'trigger',
			documentation: triggerDoc(t),
			insertText: t.name,
			isSnippet: false,
			sortText: (t.deprecated ? '1_' : '0_') + t.key,
			deprecated: t.deprecated
		}));
	}

	function complete(lines, line, character) {
		const ctx = getContext(lines, line, character);
		if (ctx.kind === 'sctrl-name') return sctrlItems(ctx.canExpand);
		if (ctx.kind === 'param') return paramItems(ctx.sec);
		if (ctx.kind === 'trigger') return triggerItems();
		return [];
	}

	// Returns { markdown, start, end } or null
	function hover(lines, line, character) {
		const t = getHoverTarget(lines, line, character);
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

module.exports = { createEngine };
