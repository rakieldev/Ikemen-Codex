'use strict';

const vscode = require('vscode');
const { createZssEngine } = require('./completion');
const { getContext } = require('./context');
const { characterFunctions } = require('./character-functions');
const { loadData } = require('../shared/data');

const KINDS = {
	sctrl: vscode.CompletionItemKind.Class,
	param: vscode.CompletionItemKind.Property,
	trigger: vscode.CompletionItemKind.Function,
	function: vscode.CompletionItemKind.Struct,
	keyword: vscode.CompletionItemKind.Keyword
};

function register(context) {
	const data = loadData();
	if (!data) return;

	// 'camelCase' (modifyExplod) or 'documentation' (ModifyExplod); read on every request
	const nameStyle = () => vscode.workspace.getConfiguration('ikemenCodex').get('zss.nameStyle', 'camelCase');
	const engine = createZssEngine(data.sctrls, data.triggers, nameStyle);

	const completion = {
		provideCompletionItems(document, position, token) {
			const text = document.getText();
			const offset = document.offsetAt(position);
			const version = document.version;
			const complete = functions => {
				if ((token && token.isCancellationRequested) || document.version !== version) return undefined;
				const items = engine.complete(text, offset, functions);
				if (!items.length) return undefined;

				const range = document.getWordRangeAtPosition(position, /[A-Za-z_][\w.]*/) ||
					new vscode.Range(position, position);

				return items.map(d => {
					const item = new vscode.CompletionItem(d.label, KINDS[d.kind]);
					item.detail = d.detail;
					item.documentation = new vscode.MarkdownString(d.documentation);
					item.insertText = d.isSnippet ? new vscode.SnippetString(d.insertText) : d.insertText;
					item.sortText = d.sortText;
					if (d.filterText) item.filterText = d.filterText;
					item.range = range;
					if (d.deprecated) item.tags = [vscode.CompletionItemTag.Deprecated];
					return item;
				});
			};
			if (document.uri.scheme !== 'file' || getContext(text, offset).kind !== 'call') return complete();
			const documents = [document].concat(vscode.workspace.textDocuments.filter(d => d !== document))
				.filter(d => d.uri.scheme === 'file' && !d.isClosed)
				.map(d => ({ fileName: d.fileName, text: d.getText() }));
			return characterFunctions(document.fileName, documents, token).then(complete, () => complete());
		}
	};

	const hover = {
		provideHover(document, position) {
			const result = engine.hover(document.getText(), document.offsetAt(position));
			if (!result) return undefined;
			return new vscode.Hover(
				new vscode.MarkdownString(result.markdown),
				new vscode.Range(document.positionAt(result.start), document.positionAt(result.end))
			);
		}
	};

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider({ language: 'zss' }, completion),
		vscode.languages.registerHoverProvider({ language: 'zss' }, hover)
	);
}

module.exports = { register };
