'use strict';

const { parseSctrls, parseTriggers, applyInherits, applyTemplateParams } = require('../../tools/docparser');
const overrides = require('../../tools/overrides.json');

// Increment when parser changes require rebuilding previously cached catalogs.
const PARSER_VERSION = 2;

function buildDocuments(sctrlMd, triggersMd) {
	const sctrls = parseSctrls(sctrlMd).list;
	const triggers = parseTriggers(triggersMd).list;
	applyInherits(sctrls, overrides.inherits);
	applyTemplateParams(sctrls, overrides.templateParams);
	validateData(sctrls, triggers);
	return { sctrls, triggers };
}

function validateData(sctrls, triggers) {
	for (const [name, list, minimum] of [['controllers', sctrls, 100], ['triggers', triggers, 50]]) {
		if (list.length < minimum) throw new Error('Too few ' + name + ': ' + list.length);
		const keys = new Set();
		for (const entry of list) {
			if (!entry.name || entry.key !== entry.name.toLowerCase() || keys.has(entry.key)) {
				throw new Error('Invalid or duplicate ' + name + ' key: ' + entry.key);
			}
			keys.add(entry.key);
		}
	}
	for (const s of sctrls) {
		if (!Array.isArray(s.params) || new Set(s.params.map(p => p.key)).size !== s.params.length ||
			s.params.some(p => !p.name || p.key !== p.name.toLowerCase())) {
			throw new Error('Invalid parameters for ' + s.name);
		}
	}
	for (const [key, params] of [['changestate', ['value']], ['selfstate', ['value', 'ctrl', 'anim']],
		['explod', ['anim', 'id', 'pos']], ['modifyexplod', ['id', 'pos']]]) {
		const entry = sctrls.find(s => s.key === key);
		if (!entry || params.some(key => !entry.params.some(p => p.key === key))) {
			throw new Error('Missing essential parameters for ' + key);
		}
	}
	for (const key of ['time', 'anim', 'command', 'var']) {
		if (!triggers.some(t => t.key === key)) throw new Error('Missing essential trigger: ' + key);
	}
}

module.exports = { buildDocuments, validateData, PARSER_VERSION };
