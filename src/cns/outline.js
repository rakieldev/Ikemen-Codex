'use strict';

const vscode = require('vscode');
const { parseSymbols } = require('./parser');

const KINDS = {
	statedef: vscode.SymbolKind.Function,
	state: vscode.SymbolKind.Event,
	section: vscode.SymbolKind.Constant
};

function toDocumentSymbol(document, s) {
	const range = new vscode.Range(
		s.startLine, 0,
		s.endLine, document.lineAt(s.endLine).text.length
	);
	const selection = document.lineAt(s.startLine).range;
	const symbol = new vscode.DocumentSymbol(s.name, s.detail, KINDS[s.kind], range, selection);
	symbol.children = s.children.map(c => toDocumentSymbol(document, c));
	return symbol;
}

function register(context) {
	const provider = {
		provideDocumentSymbols(document) {
			const lines = [];
			for (let i = 0; i < document.lineCount; i++) {
				lines.push(document.lineAt(i).text);
			}
			return parseSymbols(lines).map(s => toDocumentSymbol(document, s));
		}
	};

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: 'cns' },
			provider,
			{ label: 'Ikemen CNS' }
		)
	);
}

module.exports = { register };
