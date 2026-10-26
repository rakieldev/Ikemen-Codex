'use strict';

// Generates data/sctrls.json and data/triggers.json from the documentation.
//
//   node tools/build-data.js                         downloads from GitHub
//   node tools/build-data.js --docs C:\path\to\docs  uses local sctrl.md and triggers.md

const fs = require('fs');
const { validateData } = require('../src/shared/documents');
const path = require('path');
const { parseSctrls, parseTriggers, applyInherits, applyTemplateParams } = require('./docparser');

const RAW_BASE = 'https://raw.githubusercontent.com/potsmugen/ikemen-merged-docs/main/docs/';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SRC_DIR = path.join(DATA_DIR, 'source');

function arg(name) {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function load(file, localDir) {
	if (localDir) return fs.readFileSync(path.join(localDir, file), 'utf8');
	const url = RAW_BASE + file;
	let res;
	try {
		res = await fetch(url);
	} catch (e) {
		throw new Error(`Sem conexão ao baixar ${url}: ${e.message}`);
	}
	if (!res.ok) {
		throw new Error(
			`Não consegui baixar ${url} (HTTP ${res.status}).\n` +
			`Abra essa URL no navegador para conferir o endereço, ou baixe os .md e use --docs <pasta>.`
		);
	}
	return await res.text();
}

function write(file, payload) {
	fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(payload, null, '\t') + '\n', 'utf8');
}

async function main() {
	const localDir = arg('--docs');

	const sctrlMd = await load('sctrl.md', localDir);
	const triggersMd = await load('triggers.md', localDir);

	const sc = parseSctrls(sctrlMd);
	const tr = parseTriggers(triggersMd);

	let overrides = {};
	const overridesFile = path.join(__dirname, 'overrides.json');
	if (fs.existsSync(overridesFile)) overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
	const inherited = applyInherits(sc.list, overrides.inherits);
	validateData(sc.list, tr.list);
	applyTemplateParams(sc.list, overrides.templateParams);
	const meta = { generatedAt: new Date().toISOString(), source: localDir ? 'local' : RAW_BASE };

	// Validate both catalogs before replacing either catalog or source snapshot.
	fs.mkdirSync(SRC_DIR, { recursive: true });
	fs.writeFileSync(path.join(SRC_DIR, 'sctrl.md'), sctrlMd, 'utf8');
	fs.writeFileSync(path.join(SRC_DIR, 'triggers.md'), triggersMd, 'utf8');
	write('sctrls.json', Object.assign({}, meta, { count: sc.list.length, sctrls: sc.list }));
	write('triggers.json', Object.assign({}, meta, { count: tr.list.length, triggers: tr.list }));

	const nParams = sc.list.reduce((n, s) => n + s.params.length, 0);
	console.log(`State controllers: ${sc.list.length} (${nParams} parâmetros)`);
	console.log(`Triggers:          ${tr.list.length}`);

	if (inherited.length) console.log(`Parâmetros herdados (overrides.json): ${inherited.join(', ')}`);

	const noParams = sc.list.filter(s => s.params.length === 0).map(s => s.name);
	if (noParams.length) console.log(`\nSctrls sem parâmetros lidos (${noParams.length}): ${noParams.join(', ')}`);
	if (sc.ignored.length) console.log(`\nTítulos ignorados em sctrl.md: ${sc.ignored.join(' | ')}`);
	if (tr.ignored.length) console.log(`Títulos ignorados em triggers.md: ${tr.ignored.slice(0, 15).join(' | ')}${tr.ignored.length > 15 ? ' ...' : ''}`);

}

if (require.main === module) main().catch(e => {
	console.error('\nErro: ' + e.message);
	process.exitCode = 1;
});

module.exports = { validateData };
