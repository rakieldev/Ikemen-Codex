'use strict';

const cns = require('./cns');
const zss = require('./zss');
const air = require('./air');
const run = require('./run');
const diagnostics = require('./diagnostics');

function activate(context) {
	cns.register(context);
	zss.register(context);
	air.register(context);
	run.register(context);
	diagnostics.register(context);
	require('./shared/documentation-update').register(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
