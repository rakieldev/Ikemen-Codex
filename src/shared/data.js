'use strict';

let cache;
const listeners = new Set();

function loadData() {
	if (cache !== undefined) return cache;
	try {
		cache = {
			sctrls: require('../../data/sctrls.json').sctrls,
			triggers: require('../../data/triggers.json').triggers
		};
	} catch (e) {
		console.warn('Ikemen Codex: documentation data not found. Run "node tools/build-data.js" first.');
		cache = null;
	}
	return cache;
}

function setData(data) {
	cache = data;
	for (const listener of listeners) listener(data);
}

function onDidChangeData(listener) {
	listeners.add(listener);
	return { dispose() { listeners.delete(listener); } };
}

module.exports = { loadData, setData, onDidChangeData };
