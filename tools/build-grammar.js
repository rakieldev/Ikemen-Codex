'use strict';

// Writes the "name argument" function list (src/nameFunctions.js) into the CNS and ZSS grammars.
//
//   node tools/build-grammar.js

const fs = require('fs');
const path = require('path');
const { NAME_FUNCTIONS } = require('../src/shared/nameFunctions');

const ROOT = path.join(__dirname, '..');
const alternation = NAME_FUNCTIONS.join('|');

const TARGETS = [
	{
		file: 'syntaxes/cns.tmLanguage.json',
		match: '(?i)(' + alternation + ')\\s*\\(([^)]*)\\)'
	},
	{
		file: 'syntaxes/zss.tmLanguage.json',
		match: '(?i)\\b(' + alternation + ')\\s*(\\()([^()\\n]*)(\\))'
	}
];

for (const target of TARGETS) {
	const file = path.join(ROOT, target.file);
	const grammar = JSON.parse(fs.readFileSync(file, 'utf8'));

	// The list lives in the first pattern of the "functions" rule
	const rule = grammar.repository && grammar.repository.functions && grammar.repository.functions.patterns[0];
	if (!rule || !rule.match) {
		console.error('Could not find repository.functions.patterns[0] in ' + target.file);
		process.exit(1);
	}
	new RegExp(target.match.replace('(?i)', ''));   // fails loudly if the pattern is invalid

	const changed = rule.match !== target.match;
	rule.match = target.match;
	fs.writeFileSync(file, JSON.stringify(grammar, null, '\t') + '\n', 'utf8');
	console.log((changed ? 'updated   ' : 'unchanged ') + target.file);
}
console.log(NAME_FUNCTIONS.length + ' functions: ' + NAME_FUNCTIONS.join(', '));
