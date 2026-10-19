'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { planRun } = require('./logic');

const output = vscode.window.createOutputChannel('Ikemen GO');
let child = null;

function settings() {
	return vscode.workspace.getConfiguration('ikemenVS.ikemen');
}

function quote(arg) {
	return /\s/.test(arg) ? '"' + arg + '"' : arg;
}

function stop() {
	if (child) {
		child.kill();
		child = null;
	}
}

function fail(message, openSettings) {
	const buttons = openSettings ? ['Open Settings'] : [];
	vscode.window.showErrorMessage('IkemenVS: ' + message, ...buttons).then(choice => {
		if (choice) vscode.commands.executeCommand('workbench.action.openSettings', 'ikemenVS.ikemen');
	});
}

function launch(exe, args, description) {
	stop();
	output.clear();
	output.appendLine('# ' + description);
	output.appendLine('> ' + [exe].concat(args).map(quote).join(' '));
	output.show(true);

	// The engine expects its own folder as working directory
	const proc = spawn(exe, args, { cwd: path.dirname(exe) });
	child = proc;
	proc.stdout.on('data', d => output.append(d.toString()));
	proc.stderr.on('data', d => output.append(d.toString()));
	proc.on('error', e => {
		output.appendLine('[could not start: ' + e.message + ']');
		if (child === proc) child = null;
	});
	proc.on('exit', code => {
		output.appendLine('\n[Ikemen GO exited' + (code === null ? '' : ' with code ' + code) + ']');
		if (child === proc) child = null;
	});
}

async function run(side) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		fail('open a character file (.def, .cns, .cmd, .zss, .air...) first.');
		return;
	}

	const cfg = settings();
	const exe = (cfg.get('executable', '') || '').trim();
	if (!exe || !fs.existsSync(exe)) {
		fail('set the path of the Ikemen GO executable (ikemenVS.ikemen.executable).', true);
		return;
	}

	// The engine reads files from disk, so unsaved edits would not be tested
	if (cfg.get('saveBeforeRun', true)) {
		try {
			if (!await vscode.workspace.saveAll(false)) {
				fail('Files could not be saved. Running Ikemen GO was cancelled.');
				return;
			}
		} catch (e) {
			fail('Files could not be saved. Running Ikemen GO was cancelled.');
			return;
		}
	}

	const plan = planRun({
		file: editor.document.fileName,
		text: editor.document.getText(),
		side,
		exeDir: path.dirname(exe),
		settings: {
			opponent: cfg.get('opponent', 'kfm_zss'),
			opponentAI: cfg.get('opponentAI', 0),
			stage: cfg.get('stage', ''),
			extraArgs: cfg.get('extraArgs', [])
		}
	});
	if (plan.error) {
		fail(plan.error);
		return;
	}
	launch(exe, plan.args, plan.description);
}

function register(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('ikemenVS.run', () => run('p1')),
		vscode.commands.registerCommand('ikemenVS.runAsP2', () => run('p2')),
		vscode.commands.registerCommand('ikemenVS.stop', stop),
		output,
		{ dispose: stop }
	);
}

module.exports = { register };
