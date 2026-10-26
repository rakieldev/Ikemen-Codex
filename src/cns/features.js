'use strict';

const vscode = require('vscode');
const { createEngine } = require('./completion');
const { loadData, onDidChangeData } = require('../shared/data');

const KINDS = {
	sctrl: vscode.CompletionItemKind.Class,
	param: vscode.CompletionItemKind.Property,
	trigger: vscode.CompletionItemKind.Function
};

function readLines(document) {
	const lines = [];
	for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);
	return lines;
}

function register(context) {
	const data = loadData();
	if (!data) return;
	let engine = createEngine(data.sctrls, data.triggers);
	context.subscriptions.push(onDidChangeData(data => {
		engine = createEngine(data.sctrls, data.triggers);
	}));

	const completion = {
		provideCompletionItems(document, position) {
			const items = engine.complete(readLines(document), position.line, position.character);
			if (!items.length) return undefined;

			const range = document.getWordRangeAtPosition(position, /[A-Za-z_][\w.]*/) ||
				new vscode.Range(position, position);

			return items.map(d => {
				const item = new vscode.CompletionItem(d.label, KINDS[d.kind]);
				item.detail = d.detail;
				item.documentation = new vscode.MarkdownString(d.documentation);
				const needsSpace = /^\s*(?:type|trigger(?:all|\d+))\s*=$/i.test(
					document.lineAt(position.line).text.slice(0, range.start.character));
				const insertText = (needsSpace ? ' ' : '') + d.insertText;
				item.insertText = d.isSnippet ? new vscode.SnippetString(insertText) : insertText;
				item.sortText = d.sortText;
				if (d.filterText) item.filterText = d.filterText;
				item.range = range;
				if (d.deprecated) item.tags = [vscode.CompletionItemTag.Deprecated];
				return item;
			});
		}
	};

	const hover = {
		provideHover(document, position) {
			const result = engine.hover(readLines(document), position.line, position.character);
			if (!result) return undefined;
			return new vscode.Hover(
				new vscode.MarkdownString(result.markdown),
				new vscode.Range(position.line, result.start, position.line, result.end)
			);
		}
	};

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider({ language: 'cns' }, completion, '='),
		vscode.languages.registerHoverProvider({ language: 'cns' }, hover)
	);
}

module.exports = { register };
