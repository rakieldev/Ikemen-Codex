'use strict';

// Pure logic (no VS Code dependency) for the "run in Ikemen GO" commands:
// finds the character being edited and builds the Quick VS command line.
// Command line options come from the Ikemen GO wiki ("Miscellaneous info").

const path = require('path');
const fs = require('fs');

const RE_FILES_SECTION = /^\s*\[\s*files\s*\]/im;
const RE_CHAR_KEY = /^\s*(cns|sprite|anim|cmd)\s*=/im;
const RE_STAGE_SECTION = /^\s*\[\s*stageinfo\s*\]/im;

function readText(file, io) {
	try { return io.readFileSync(file, 'utf8'); } catch (e) { return ''; }
}

// A character .def has a [Files] section pointing at cns/sprite/anim/cmd.
// (system.def and fight.def also have [Files], but never those keys.)
function isCharacterDef(text) {
	return RE_FILES_SECTION.test(text) && RE_CHAR_KEY.test(text);
}

function isStageDef(text) {
	return RE_STAGE_SECTION.test(text);
}

// Starting from the file being edited, looks for the character's .def in the
// same folder and then up to two folders above (covers states/ subfolders).
function findCharacterDef(file, io) {
	io = io || fs;
	if (file.toLowerCase().endsWith('.def') && isCharacterDef(readText(file, io))) return file;

	let dir = path.dirname(file);
	for (let depth = 0; depth < 3; depth++) {
		let names = [];
		try { names = io.readdirSync(dir); } catch (e) { names = []; }

		const defs = names
			.filter(n => n.toLowerCase().endsWith('.def'))
			.map(n => path.join(dir, n))
			.filter(f => isCharacterDef(readText(f, io)));

		if (defs.length) {
			const folder = path.basename(dir).toLowerCase();
			// prefer kfm/kfm.def over kfm/kfm_alt.def
			return defs.find(f => path.basename(f, path.extname(f)).toLowerCase() === folder) || defs[0];
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

// Paths inside the engine folder are passed relative to it (the engine runs
// with that folder as working directory); everything else stays absolute.
// Plain names such as "kfm" are returned untouched.
function toEngineArg(target, exeDir) {
	if (!path.isAbsolute(target)) return target.replace(/\\/g, '/');
	const rel = path.relative(exeDir, target);
	if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
	return target;
}

function buildArgs(o) {
	const args = [];
	if (o.p1) args.push('-p1', o.p1);
	if (o.p2) args.push('-p2', o.p2);
	if (o.p1AI) args.push('-p1.ai', String(o.p1AI));
	if (o.p2AI) args.push('-p2.ai', String(o.p2AI));
	if (o.stage) args.push('-s', o.stage);
	return args.concat(o.extra || []);
}

// side: 'p1' (edited character is player 1) or 'p2'.
// Returns { args, description } or { error }.
function planRun(o) {
	const io = o.io || fs;
	const s = o.settings;
	const opponent = toEngineArg((s.opponent || 'kfm_zss').trim(), o.exeDir);
	const extra = Array.isArray(s.extraArgs) ? s.extraArgs.map(String) : [];

	// A stage .def being edited: test it with the opponent character on both sides
	if (o.file.toLowerCase().endsWith('.def') && isStageDef(o.text || '')) {
		const stage = toEngineArg(o.file, o.exeDir);
		return {
			args: buildArgs({ p1: opponent, p2: opponent, stage, extra }),
			description: 'Stage ' + path.basename(o.file) + ' with ' + opponent
		};
	}

	const def = findCharacterDef(o.file, io);
	if (!def) {
		return { error: "Could not find the character's .def next to this file. Open a file inside the character folder." };
	}
	const me = toEngineArg(def, o.exeDir);
	const stage = (s.stage || '').trim() ? toEngineArg(s.stage.trim(), o.exeDir) : '';
	const ai = Number(s.opponentAI) || 0;

	if (o.side === 'p2') {
		return {
			args: buildArgs({ p1: opponent, p2: me, p1AI: ai, stage, extra }),
			description: opponent + ' (P1) vs ' + path.basename(def) + ' (P2)'
		};
	}
	return {
		args: buildArgs({ p1: me, p2: opponent, p2AI: ai, stage, extra }),
		description: path.basename(def) + ' (P1) vs ' + opponent + ' (P2)'
	};
}

module.exports = { findCharacterDef, isCharacterDef, isStageDef, toEngineArg, buildArgs, planRun };