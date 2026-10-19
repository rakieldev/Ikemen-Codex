'use strict';

const vscode = require('vscode');
const { createChecker } = require('./checker');
const { loadData } = require('../shared/data');

const SEVERITY = {
	error: vscode.DiagnosticSeverity.Error,
	warning: vscode.DiagnosticSeverity.Warning,
	info: vscode.DiagnosticSeverity.Information
};

// Only character code is checked: never .def, .const, .air or anything else
function appliesTo(document) {
	if (document.uri.scheme !== 'file') return false;
	const name = document.fileName.toLowerCase();
	if (document.languageId === 'zss') return name.endsWith('.zss');
	if (document.languageId === 'cns') return /\.(cns|cmd|st)$/.test(name);
	return false;
}

function options() {
	const cfg = vscode.workspace.getConfiguration('ikemenVS.diagnostics');
	return {
		enabled: cfg.get('enabled', true),
		triggers: cfg.get('unknownTriggers', true),
		semicolons: cfg.get('missingSemicolons', true),
		ignoredNames: cfg.get('ignoredNames', [])
	};
}

function register(context) {
	const data = loadData();
	if (!data) return;

	const checker = createChecker(data.sctrls, data.triggers);
	const collection = vscode.languages.createDiagnosticCollection('ikemenVS');
	const timers = new Map();

	function refresh(document) {
		const o = options();
		if (!o.enabled || !appliesTo(document)) {
			collection.delete(document.uri);
			return;
		}
		try {
			const text = document.getText();
			const found = document.languageId === 'zss' ? checker.checkZss(text, o) : checker.checkCns(text, o);
			collection.set(document.uri, found.map(d => {
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(d.sl, d.sc, d.el, d.ec), d.message, SEVERITY[d.severity]
				);
				diagnostic.source = 'IkemenVS';
				diagnostic.code = d.code;
				return diagnostic;
			}));
		} catch (e) {
			console.error('IkemenVS diagnostics failed:', e);
			collection.delete(document.uri);
		}
	}

	// Re-check shortly after the user stops typing
	function schedule(document) {
		const key = document.uri.toString();
		clearTimeout(timers.get(key));
		timers.set(key, setTimeout(() => {
			timers.delete(key);
			refresh(document);
		}, 400));
	}

	context.subscriptions.push(
		collection,
		vscode.workspace.onDidOpenTextDocument(refresh),
		vscode.workspace.onDidChangeTextDocument(e => schedule(e.document)),
		vscode.workspace.onDidCloseTextDocument(document => {
			const key = document.uri.toString();
			clearTimeout(timers.get(key));
			timers.delete(key);
			collection.delete(document.uri);
		}),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ikemenVS.diagnostics')) vscode.workspace.textDocuments.forEach(refresh);
		}),
		{ dispose() { timers.forEach(t => clearTimeout(t)); timers.clear(); } }
	);

	vscode.workspace.textDocuments.forEach(refresh);
}

module.exports = { register };
