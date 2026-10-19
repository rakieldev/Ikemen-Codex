'use strict';

// Triggers whose parentheses hold a NAME or specifier instead of an expression, such as
// const(velocity.walk.fwd.x), gameVar(superpausetime) or isAsserted(Intro).
//
// Single source for two things:
//   - diagnostics.js does not look for unknown triggers inside their parentheses
//   - tools/build-grammar.js writes this list into the CNS and ZSS grammars, which color
//     the argument as plain text
//
// The documentation does not say which triggers behave like this, so the list is
// maintained by hand: add a name here and run "node tools/build-grammar.js".
const NAME_FUNCTIONS = [
	'const', 'const240p', 'const480p', 'const720p', 'stagevar', 'stageconst', 'gethitvar',
	'animframe', 'clsnoverlap', 'clsnvar', 'explodvar', 'fightscreenvar', 'hitdefvar',
	'inputtime', 'map', 'projvar', 'gamevar', 'isasserted', 'drawpal'
];

module.exports = { NAME_FUNCTIONS };
