'use strict';

const vscode = require('vscode');
const { parseActions } = require('./parser');

function register(context) {
	const provider = {
		provideDocumentSymbols(document) {
			const lines = [];
			for (let i = 0; i < document.lineCount; i++) {
				lines.push(document.lineAt(i).text);
			}
			return parseActions(lines).map(a => {
				const range = new vscode.Range(
					a.startLine, 0,
					a.endLine, document.lineAt(a.endLine).text.length
				);
				return new vscode.DocumentSymbol(
					a.name, a.detail, vscode.SymbolKind.Event,
					range, document.lineAt(a.startLine).range
				);
			});
		}
	};

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: 'air' }, provider, { label: 'Ikemen AIR' }
		)
	);
}

module.exports = { register };
