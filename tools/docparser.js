'use strict';

// Reads the markdown of the "Ikemen GO Merged Documentation" and returns
// plain JS structures. No dependencies: text goes in, objects come out.

const RE_TAGGED = /^(.+?)\s+\((old|changed|new)\)\s*$/;
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const LABEL_RE = /^(required|optional|deprecated|alternate|details?|notes?|examples?|supported|token list|format|args?|arguments?|returns?|return value|errors?)\b/i;
// A description only counts as "deprecated" when it says so about the item
// itself ("Explod ... replaces GameMakeAnim, which is now deprecated" must not match).
const RE_SCTRL_DEPRECATED = /^(deprecated\b|this (state )?controller (is|has been|was) [^.]*\b(deprecated|superseded|replaced))/i;
const RE_TRIGGER_DEPRECATED = /^(deprecated\b|this trigger (is|has been|was) [^.]*\b(deprecated|superseded|replaced))/i;

// headings that show up in "changed" sections but are not parameters
const IGNORE_HEADINGS = new Set([
	'ikemenversion', 'mugenversion', 'notes', 'note', 'example', 'examples',
	'details', 'syntax', 'new', 'old'
]);

// ---------- text helpers ----------

function stripHeading(text) {
	return text
		.replace(/<[^>]+>/g, '')
		.replace(/\s*\{#[^}]*\}\s*$/, '')
		.replace(/\s*#+\s*$/, '')
		.trim();
}

function cleanInline(s) {
	return s.replace(/[“”]/g, '"').replace(/`/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function pushLine(arr, text) {
	const t = text.trim();
	if (t === '') {
		if (arr.length && arr[arr.length - 1] !== '') arr.push('');
	} else {
		arr.push(t);
	}
}

function joinLines(arr) {
	const out = [];
	let buf = [];
	const flush = () => { if (buf.length) { out.push(buf.join(' ')); buf = []; } };
	for (const l of arr) {
		if (l === '') { flush(); out.push(''); }
		else if (/^[-*]\s/.test(l)) { flush(); out.push(l); }
		else buf.push(l);
	}
	flush();
	return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function truncate(s, max) {
	if (s.length <= max) return s;
	const cut = s.slice(0, max);
	return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trimEnd() + '…';
}

// ---------- splitting into sections (## Name (old|changed|new)) ----------

// Removes raw HTML (anchors, spans...), HTML comments and Jekyll/kramdown leftovers
// such as "{: .no_toc }" from the markdown. Code fences are left untouched.
function stripHtml(text) {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const out = [];
	let buf = [];
	let inFence = false;

	const flush = () => {
		if (!buf.length) return;
		const cleaned = buf.join('\n')
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<\/?(?:a|span|div|p|br|img|sup|sub|b|i|em|strong|details|summary|table|thead|tbody|tr|td|th)\b[^>]*>/gi, '')
			.replace(/\{:[^}\n]*\}/g, '')
			.replace(/\{%[^%\n]*%\}/g, '')
			.replace(/&nbsp;/g, ' ');
		out.push(...cleaned.split('\n'));
		buf = [];
	};

	for (const line of lines) {
		if (/^\s*```/.test(line)) { flush(); out.push(line); inFence = !inFence; continue; }
		if (inFence) out.push(line); else buf.push(line);
	}
	flush();
	return out.join('\n');
}

function splitSections(text, startAfter) {
	const lines = stripHtml(text).split('\n');
	const sections = [];
	const skipped = [];
	let cur = null;
	let inFence = false;
	let active = !startAfter;

	for (const line of lines) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			if (cur) cur.lines.push(line);
			continue;
		}
		if (inFence) {
			if (cur) cur.lines.push(line);
			continue;
		}
		const h1 = /^#\s+(.+)$/.exec(line);
		if (h1) {
			cur = null;
			if (startAfter) active = startAfter.test(h1[1]);
			continue;
		}
		const h2 = /^##\s+(.+)$/.exec(line);
		if (h2) {
			cur = null;
			if (!active) continue;
			const m = RE_TAGGED.exec(stripHeading(h2[1]));
			if (!m) { skipped.push(stripHeading(h2[1])); continue; }
			cur = { rawTitle: m[1].trim(), tag: m[2], lines: [] };
			sections.push(cur);
			continue;
		}
		if (cur) cur.lines.push(line);
	}
	return { sections, skipped };
}

function parseTitle(rawTitle) {
	const nightly = /\(nightly build only\)/i.test(rawTitle);
	const experimental = /\[experimental\]/i.test(rawTitle);
	const clean = rawTitle
		.replace(/\(nightly build only\)/ig, '')
		.replace(/\[experimental\]/ig, '')
		.replace(/\s+/g, ' ')
		.trim();
	return { clean, nightly, experimental };
}

// ---------- parameter line: **name = *placeholder* (type)** ----------

function parseParamLine(line) {
	// The nightly tag may follow the closing emphasis instead of being inside it.
	const trailingNightly = /\*\s*\(nightly build only\)\s*$/i.test(line.trim());
	const s = line.trim().replace(/(\*)\s*\(nightly build only\)\s*$/i, '$1');
	if (!/^\*/.test(s) || !/\*$/.test(s)) return null;
	const body = s.replace(/^\*+/, '').replace(/\*+$/, '').trim();
	const m = /^([A-Za-z_][\w.]*)\s*(=|\()/.exec(body);
	if (!m) return null;

	let rest = body.slice(m[1].length).trim();
	if (rest.startsWith('=')) rest = rest.slice(1).trim();

	const alsoNames = [];
	const orm = /\s+OR\s+([A-Za-z_][\w.]*)\s*=/.exec(rest);
	if (orm) {
		alsoNames.push(orm[1]);
		rest = rest.slice(0, orm.index).trim();
	}

	const types = [];
	let nightly = trailingNightly;
	const re = /\(([^()]*)\)/g;
	let t;
	while ((t = re.exec(rest))) {
		// "(nightly build only)" is a tag, not a type
		if (/nightly build only/i.test(t[1])) nightly = true;
		else types.push(t[1].trim());
	}
	const placeholder = cleanInline(rest.replace(/\([^()]*\)/g, ' '))
		.replace(/"/g, '')
		.replace(/\s*,\s*/g, ', ')
		.replace(/[,;]\s*$/, '')
		.trim();

	return { name: m[1], placeholder, type: types.join(', '), alsoNames, nightly };
}

function upsert(params, name) {
	const key = name.toLowerCase();
	let p = params.find(x => x.key === key);
	if (!p) {
		p = {
			key, name, placeholder: '', type: '', required: false, deprecated: false,
			nightly: false, fromLine: false, lines: []
		};
		params.push(p);
	}
	return p;
}

// ---------- body of a section ----------

function parseBody(lines, names) {
	const info = { descLines: [], params: [], flags: [], example: '', sections: {} };
	const isAssertSpecial = names.some(n => n.toLowerCase() === 'assertspecial');
	let mode = 'desc';        // desc | required | optional | deprecated | other
	let label = '';
	let cur = null;           // who receives the description lines
	let labelLines = null;    // text under labels such as Format/Details
	let inFence = false;
	let fence = [];

	for (const raw of lines) {
		if (/^\s*```/.test(raw)) {
			if (!inFence) {
				inFence = true;
				fence = [];
			} else {
				inFence = false;
				const code = fence.join('\n').trimEnd();
				if (label === 'example' && !info.example) info.example = code;
				if (labelLines && label !== 'example') labelLines.push(code);
				cur = null;
			}
			continue;
		}
		if (inFence) { fence.push(raw); continue; }

		const line = raw.trim();

		// "---" separates sections in the markdown: it is not description text
		if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) { cur = null; labelLines = null; continue; }

		// ### Name  -> parameter documented only by its heading ("changed" sections)
		const h3 = /^###\s+(.+)$/.exec(line);
		if (h3) {
			const nightly = /nightly/i.test(h3[1]);
			const t = h3[1].replace(/\(nightly build only\)/ig, '').trim();
			if (/^[A-Za-z_][\w.]*$/.test(t) && !IGNORE_HEADINGS.has(t.toLowerCase())) {
				const p = upsert(info.params, t);
				if (nightly) p.nightly = true;
				cur = p;
			} else {
				cur = null;
			}
			labelLines = null;
			continue;
		}
		// #### Name -> flag value (AssertSpecial)
		const h4 = /^#{4,}\s+(.+)$/.exec(line);
		if (h4) {
			cur = null;
			labelLines = null;
			const n = h4[1].trim();
			if (isAssertSpecial && /^[A-Za-z]\w*$/.test(n)) {
				const f = { name: n, lines: [] };
				info.flags.push(f);
				cur = f;
			}
			continue;
		}

		// **Required parameters:**  **Example:**  **Format:** ...
		const lm = /^\*\*\s*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/.exec(line);
		if (lm && LABEL_RE.test(lm[1])) {
			const name = lm[1].toLowerCase();
			cur = null;
			labelLines = null;
			if (/^required/.test(name)) { mode = 'required'; label = ''; }
			else if (/^optional/.test(name)) { mode = 'optional'; label = ''; }
			else if (/^deprecated/.test(name)) { mode = 'deprecated'; label = ''; }
			else {
				mode = 'other';
				label = /^example/.test(name) ? 'example' : name.replace(/\s+/g, '_');
				labelLines = info.sections[label] = info.sections[label] || [];
				if (lm[2]) pushLine(labelLines, lm[2]);
			}
			continue;
		}

		const pl = parseParamLine(line);
		if (pl) {
			const p = upsert(info.params, pl.name);
			p.fromLine = true;
			if (pl.type) p.type = pl.type;
			if (pl.placeholder) p.placeholder = pl.placeholder;
			if (pl.nightly) p.nightly = true;
			if (mode === 'required') p.required = true;
			if (mode === 'deprecated') p.deprecated = true;
			for (const alias of pl.alsoNames) {
				const a = upsert(info.params, alias);
				a.fromLine = true;
				a.type = a.type || pl.type;
				a.placeholder = a.placeholder || pl.placeholder;
				a.aliasOf = pl.name;
			}
			cur = p;
			labelLines = null;
			continue;
		}

		if (isAssertSpecial) {
			const fm = /^\*\*([A-Za-z]\w*)\*\*$/.exec(line);
			if (fm) {
				const f = { name: fm[1], lines: [] };
				info.flags.push(f);
				cur = f;
				continue;
			}
		}

		if (cur) pushLine(cur.lines, line);
		else if (labelLines) pushLine(labelLines, line);
		else if (mode === 'desc') pushLine(info.descLines, line);
	}
	return info;
}

function finishParams(params) {
	const out = [];
	for (const p of params) {
		if (IGNORE_HEADINGS.has(p.key)) continue;
		let description = truncate(joinLines(p.lines), 700);
		if (/^see below\.?$/i.test(description)) description = '';
		out.push({
			key: p.key,
			name: p.name,
			placeholder: p.placeholder,
			type: p.type,
			required: p.required,
			deprecated: p.deprecated,
			nightly: p.nightly,
			template: /(?<![A-Z])X(?![A-Za-z])/.test(p.name),
			inferred: !p.fromLine,
			aliasOf: p.aliasOf || '',
			description
		});
	}
	// a heading such as "Interpolation"/"Size" that is just a prefix of other parameters is not a parameter
	return out.filter(p => !(p.inferred && out.some(o => o.key.startsWith(p.key + '.'))));
}

// ---------- state controllers ----------

function parseSctrls(text) {
	const { sections, skipped } = splitSections(text, /^State Controllers\s*$/i);
	const map = new Map();
	const ignored = [];

	for (const sec of sections) {
		const { clean, nightly, experimental } = parseTitle(sec.rawTitle);
		const names = clean.split(',').map(s => s.trim()).filter(Boolean);
		if (!names.length || !names.every(n => NAME_RE.test(n))) {
			ignored.push(sec.rawTitle);
			continue;
		}
		const info = parseBody(sec.lines, names);
		const params = finishParams(info.params);
		const desc = truncate(joinLines(info.descLines), 900);

		for (const name of names) {
			const key = name.toLowerCase();
			let e = map.get(key);
			if (!e) {
				e = {
					key, name, tags: [], nightly: false, experimental: false, deprecated: false,
					description: '', changeNotes: [], params: [], flags: [], example: ''
				};
				map.set(key, e);
			}
			if (!e.tags.includes(sec.tag)) e.tags.push(sec.tag);
			if (sec.tag !== 'old' && nightly && e.tags.length === 1) e.nightly = true;
			if (experimental) e.experimental = true;

			if (sec.tag === 'changed') {
				if (desc) e.changeNotes.push(desc);
			} else if (desc && !e.description) {
				e.description = desc;
			}
			if (!e.example && info.example && !/^none$/i.test(info.example)) e.example = info.example;

			for (const p of params) {
				let ex = e.params.find(x => x.key === p.key);
				if (!ex) {
					ex = Object.assign({ since: sec.tag, changeNote: '' }, p);
					e.params.push(ex);
				} else {
					if (sec.tag === 'old') ex.since = 'old';
					if (sec.tag === 'changed') {
						if (p.description && ex.description) ex.changeNote = p.description;
						else if (p.description) ex.description = p.description;
					} else if (p.description) {
						ex.description = p.description;
					}
					if (p.type && !ex.type) ex.type = p.type;
					if (p.placeholder && !ex.placeholder) ex.placeholder = p.placeholder;
					if (p.required) ex.required = true;
					if (p.nightly) ex.nightly = true;
					if (p.deprecated) ex.deprecated = true;
					if (!p.inferred) ex.inferred = false;
				}
			}
			for (const f of info.flags) {
				const description = truncate(joinLines(f.lines), 400);
				const ex = e.flags.find(x => x.name.toLowerCase() === f.name.toLowerCase());
				if (!ex) e.flags.push({ name: f.name, description });
				else if (description && !ex.description) ex.description = description;
			}
		}
	}

	const list = [...map.values()].map(e => {
		e.deprecated = RE_SCTRL_DEPRECATED.test(e.description.split('\n\n')[0] || '');
		e.params.sort((a, b) => (b.required - a.required) || 0);
		return e;
	}).sort((a, b) => a.key.localeCompare(b.key));

	return { list, ignored: ignored.concat(skipped) };
}

// ---------- triggers ----------
// Tolerant parser: written before the real file could be inspected, so check its output.

function parseTriggers(text) {
	const { sections, skipped } = splitSections(text, null);
	const map = new Map();
	const ignored = [];

	for (const sec of sections) {
		const { clean, nightly, experimental } = parseTitle(sec.rawTitle);
		const titles = clean.split(',').map(s => s.trim()).filter(Boolean);
		const names = titles.map(t => (/^[A-Za-z][A-Za-z0-9_]*/.exec(t) || [''])[0]);
		if (!names.length || names.some(n => !n)) { ignored.push(sec.rawTitle); continue; }

		const info = parseBody(sec.lines, names);
		const desc = truncate(joinLines(info.descLines), 900);
		const section = k => truncate(joinLines((info.sections[k] || []).filter(Boolean)).replace(/`/g, ''), 700);

		names.forEach((name, i) => {
			const key = name.toLowerCase();
			let e = map.get(key);
			if (!e) {
				e = {
					key, name, signature: titles[i], tags: [], nightly: false, experimental: false,
					deprecated: false, description: '', format: '', args: '', returns: '',
					details: '', example: '', changeNotes: []
				};
				map.set(key, e);
			}
			if (!e.tags.includes(sec.tag)) e.tags.push(sec.tag);
			if (nightly) e.nightly = true;
			if (experimental) e.experimental = true;
			if (sec.tag === 'changed') {
				if (desc) e.changeNotes.push(desc);
			} else if (desc && !e.description) {
				e.description = desc;
			}
			if (!e.format) e.format = section('format');
			if (!e.args) e.args = section('args') || section('arguments');
			if (!e.returns) e.returns = section('return_value') || section('returns') || section('return');
			if (!e.details) e.details = section('details') || section('notes');
			if (!e.example && info.example) e.example = info.example;
		});
	}

	const list = [...map.values()].map(e => {
		e.deprecated = RE_TRIGGER_DEPRECATED.test(e.description.split('\n\n')[0] || '');
		return e;
	}).sort((a, b) => a.key.localeCompare(b.key));
	return { list, ignored: ignored.concat(skipped) };
}

// Some controllers are documented as "same parameters as X" (ModifyExplod, SelfState...).
// overrides.json maps them to their source. Parameters are MERGED: the target's own
// entries win, and anything it lacks is copied from the source. With
// { "from": "Explod", "required": false } the copied parameters become optional
// (a Modify* controller does not need everything its source needs).
function applyInherits(list, inherits) {
	const byKey = new Map(list.map(e => [e.key, e]));
	const applied = [];
	for (const [from, spec] of Object.entries(inherits || {})) {
		const cfg = typeof spec === 'string' ? { from: spec } : spec;
		const target = byKey.get(from.toLowerCase());
		const source = byKey.get(String(cfg.from).toLowerCase());
		if (!target || !source) throw new Error('Invalid parameter inheritance: ' + from + ' <- ' + cfg.from);

		let added = 0;
		for (const p of source.params) {
			const own = target.params.find(x => x.key === p.key);
			if (own) {
				// A changed-section heading may lack the original type and placeholder.
				if (own.inferred && !p.inferred) {
					own.type = own.type || p.type;
					own.placeholder = own.placeholder || p.placeholder;
					own.inferred = false;
				}
				continue;
			}
			const copy = Object.assign({}, p);
			if (cfg.required === false) copy.required = false;
			target.params.push(copy);
			added++;
		}
		if (added) {
			target.params.sort((a, b) => (b.required - a.required) || 0);
			target.inheritsFrom = source.name;
			applied.push(target.name + ' <- ' + source.name + ' (+' + added + ')');
		}
	}
	return applied;
}

// Explicitly reviewed heading-only parameters may appear in full templates.
// Keep inferred metadata unchanged: individual suggestions retain their ranking.
function applyTemplateParams(list, overrides) {
	for (const [name, params] of Object.entries(overrides || {})) {
		const controller = list.find(s => s.key === name.toLowerCase());
		for (const name of params) {
			const param = controller && controller.params.find(p => p.key === name.toLowerCase());
			if (!param) throw new Error('Unknown template parameter: ' + name);
			param.includeInTemplate = true;
		}
	}
}

module.exports = { parseSctrls, parseTriggers, parseParamLine, splitSections, applyInherits, applyTemplateParams };
