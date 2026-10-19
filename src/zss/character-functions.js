"use strict";

// Read only the active character's DEF references, on demand for call completion.
// No global function cache: unsaved buffers and file changes apply on the next request.
const fs = require('fs').promises;
const path = require('path');
const { declaredFunctions } = require('./context');

const fileKey = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);

function stateReferences(text) {
	const sections = text.split(/\r?\n/);
	const values = new Map();
	let inFiles = false;
	for (const raw of sections) {
		let quoted = false;
		let end = raw.length;
		for (let i = 0; i < raw.length; i++) {
			if (raw[i] === '"') quoted = !quoted;
			if (raw[i] === ';' && !quoted) { end = i; break; }
		}
		const line = raw.slice(0, end).trim();
		const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
		if (header) {
			if (inFiles) break; // Match the engine's first [Files] section.
			inFiles = header[1].toLowerCase() === 'files';
			continue;
		}
		if (!inFiles) continue;
		const entry = /^(st\d*|cmd|stcommon)\s*=\s*(.*?)\s*$/i.exec(line);
		if (!entry || values.has(entry[1].toLowerCase())) continue;
		const value = entry[2].replace(/^"(.*)"$/, '$1').trim();
		if (value) values.set(entry[1].toLowerCase(), value);
	}
	const states = [...values.keys()].filter(k => /^st\d*$/.test(k))
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
	return states.concat(['cmd', 'stcommon']).filter(k => values.has(k)).map(k => values.get(k));
}

async function characterFunctions(file, documents = [], token, io = fs) {
	const buffers = new Map(documents.map(d => [fileKey(d.fileName), d.text]));
	async function read(file) {
		if (buffers.has(fileKey(file))) return buffers.get(fileKey(file));
		try { return await io.readFile(file, 'utf8'); } catch (e) { return undefined; }
	}
	async function resolveFile(reference, dir) {
		const file = path.resolve(dir, reference.replace(/\\/g, '/'));
		const relative = path.relative(dir, file);
		// Deliberately exclude external/common engine directories and other characters.
		if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
		const text = await read(file);
		if (text !== undefined) return /\.zss$/i.test(file) ? { file, text } : null;
		if (/\.zss$/i.test(file)) return null;
		const alternate = file + '.zss'; // Engine fallback: common1.cns -> common1.cns.zss.
		const alternateText = await read(alternate);
		return alternateText === undefined ? null : { file: alternate, text: alternateText };
	}

	let dir = path.dirname(path.resolve(file));
	for (let depth = 0; depth < 3; depth++) {
		if (token && token.isCancellationRequested) return null;
		let names;
		try { names = await io.readdir(dir); } catch (e) { names = []; }
		// Include a new unsaved DEF even if it is not present on disk yet.
		for (const doc of documents) {
			if (fileKey(path.dirname(doc.fileName)) === fileKey(dir)) names.push(path.basename(doc.fileName));
		}
		const candidates = [];
		for (const name of [...new Set(names)].filter(n => /\.def$/i.test(n)).sort()) {
			if (token && token.isCancellationRequested) return null;
			const def = path.join(dir, name);
			const text = await read(def);
			if (text === undefined) continue;
			const files = (await Promise.all(stateReferences(text).map(ref => resolveFile(ref, dir)))).filter(Boolean);
			const unique = [...new Map(files.map(f => [fileKey(f.file), f])).values()];
			if (unique.some(f => fileKey(f.file) === fileKey(file))) candidates.push(unique);
		}
		if (candidates.length) {
			const signature = files => JSON.stringify(files.map(f => fileKey(f.file)));
			if (candidates.some(files => signature(files) !== signature(candidates[0]))) return null;
			const functions = new Map();
			for (const entry of candidates[0]) {
				for (const fn of declaredFunctions(entry.text)) {
					const key = fn.name.toLowerCase();
					if (!functions.has(key)) functions.set(key, Object.assign({}, fn,
						fileKey(entry.file) === fileKey(file) ? {} : { source: path.relative(dir, entry.file).replace(/\\/g, '/') }));
				}
			}
			return [...functions.values()];
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null; // No unambiguous character: keep the current-document suggestions.
}

module.exports = { characterFunctions, stateReferences };
