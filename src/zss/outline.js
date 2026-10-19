'use strict';

const vscode = require('vscode');
const { parseZss } = require('./parser');

const KINDS = {
	statedef: vscode.SymbolKind.Function,
	function: vscode.SymbolKind.Struct,
	section: vscode.SymbolKind.Constant
};

function register(context) {
	const provider = {
		provideDocumentSymbols(document) {
			const lines = [];
			for (let i = 0; i < document.lineCount; i++) {
				lines.push(document.lineAt(i).text);
			}
			return parseZss(lines).map(s => {
				const range = new vscode.Range(
					s.startLine, 0,
					s.endLine, document.lineAt(s.endLine).text.length
				);
				return new vscode.DocumentSymbol(
					s.name, s.detail, KINDS[s.kind],
					range, document.lineAt(s.startLine).range
				);
			});
		}
	};

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: 'zss' }, provider, { label: 'Ikemen ZSS' }
		)
	);
}

module.exports = { register };
