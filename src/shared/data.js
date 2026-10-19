'use strict';

// Loads the generated documentation data (data/sctrls.json and data/triggers.json) once.
// Returns { sctrls, triggers }, or null when the files do not exist yet.

let cache;

function loadData() {
	if (cache !== undefined) return cache;
	try {
		cache = {
			sctrls: require('../../data/sctrls.json').sctrls,
			triggers: require('../../data/triggers.json').triggers
		};
	} catch (e) {
		console.warn('IkemenVS: documentation data not found. Run "node tools/build-data.js" first.');
		cache = null;
	}
	return cache;
}

module.exports = { loadData };
