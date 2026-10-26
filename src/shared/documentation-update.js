'use strict';

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { buildDocuments, validateData, PARSER_VERSION } = require('./documents');
const { loadData, setData } = require('./data');

const DAY = 24 * 60 * 60 * 1000;
const API = 'https://api.github.com/repos/potsmugen/ikemen-merged-docs/commits/main';
const RAW = 'https://raw.githubusercontent.com/potsmugen/ikemen-merged-docs/';

// Bounded requests also work with the minimum supported VS Code's Node runtime.
function request(url) {
	return new Promise((resolve, reject) => {
		const req = https.get(url, { headers: { 'User-Agent': 'Ikemen-Codex', Accept: 'application/vnd.github+json' } }, res => {
			if (res.statusCode !== 200) {
				res.resume();
				reject(new Error('Documentation HTTP ' + res.statusCode));
				return;
			}
			let size = 0;
			const chunks = [];
			res.on('data', chunk => {
				size += chunk.length;
				if (size > 6 * 1024 * 1024) req.destroy(new Error('Documentation response too large'));
				else chunks.push(chunk);
			});
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			res.on('error', reject);
			res.on('aborted', () => reject(new Error('Documentation response interrupted')));
		});
		const deadline = setTimeout(() => req.destroy(new Error('Documentation request timed out')), 15000);
		req.on('close', () => clearTimeout(deadline));
		req.on('error', reject);
	});
}

// Inject network and clock dependencies to test automatic updates offline.
function startUpdater(options) {
	const { storage, state, version, enabled, publish, current, notify } = options;
	const get = options.request || request;
	const now = options.now || Date.now;
	const schedule = options.schedule || setTimeout;
	const cancel = options.cancel || clearTimeout;
	const file = path.join(storage, 'documentation-v1.json');
	let revision;
	let needsReparse = false;
	let disposed = false;
	let timer;
	let running;

	function arm() {
		if (disposed) return;
		const last = state.get('documentation.lastAttempt', 0);
		const delay = enabled() ? Math.max(1000, Math.min(DAY, DAY - (now() - last))) : DAY;
		timer = schedule(() => { void check(); }, delay);
		if (timer && timer.unref) timer.unref();
	}

	async function update() {
		try {
			if (!enabled()) return;
			const last = state.get('documentation.lastAttempt', 0);
			if (!needsReparse && last > 0 && now() >= last && now() - last < DAY) return;
			await state.update('documentation.lastAttempt', now());
			const commit = JSON.parse(await get(API));
			if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid documentation revision');
			if (disposed || !enabled() || commit.sha === revision) return;
			const sc = await get(RAW + commit.sha + '/docs/sctrl.md');
			const tr = await get(RAW + commit.sha + '/docs/triggers.md');
			const data = buildDocuments(sc, tr);
			if (disposed || !enabled()) return;
			const changed = JSON.stringify(data) !== JSON.stringify(current());
			await fs.mkdir(storage, { recursive: true });
			// Publish both catalogs in one file; readers never see half an update.
			const temporary = file + '.' + process.pid + '.tmp';
			try {
				await fs.writeFile(temporary, JSON.stringify({ version, parserVersion: PARSER_VERSION, revision: commit.sha, data }), 'utf8');
				await fs.rename(temporary, file);
			} finally {
				await fs.unlink(temporary).catch(() => {});
			}
			revision = commit.sha;
			needsReparse = false;
			if (!disposed && enabled() && changed) {
				publish(data);
				notify();
			}
		} catch (e) {
			// Keep the last valid catalogs and avoid UI errors for background failures.
			console.warn('Ikemen Codex documentation update:', e.message);
		}
	}

	function check() {
		if (disposed) return Promise.resolve();
		if (running) return running;
		cancel(timer);
		running = update().finally(() => { running = undefined; arm(); });
		return running;
	}

	const ready = (async () => {
		try {
			if (enabled()) {
				const saved = JSON.parse(await fs.readFile(file, 'utf8'));
				if (saved.version === version && /^[a-f0-9]{40}$/.test(saved.revision)) {
					validateData(saved.data.sctrls, saved.data.triggers);
					if (!disposed && enabled()) {
						publish(saved.data);
						needsReparse = saved.parserVersion !== PARSER_VERSION;
						if (!needsReparse) revision = saved.revision;
					}
				}
			}
		} catch (_) { /* Missing or invalid cache falls back to bundled data. */ }
		await check();
	})();
	return { ready, check, dispose() { disposed = true; cancel(timer); } };
}

function register(context) {
	if (!context.globalStorageUri || !context.globalState) return;
	const vscode = require('vscode');
	const enabled = () => vscode.workspace.getConfiguration('ikemenCodex').get('documentation.autoUpdate', true);
	const updater = startUpdater({
		storage: context.globalStorageUri.fsPath,
		state: context.globalState,
		version: context.extension.packageJSON.version,
		enabled, current: loadData, publish: setData,
		notify: () => { void vscode.window.showInformationMessage('Ikemen Codex: documentation updated.'); }
	});
	context.subscriptions.push(updater);
}

module.exports = { startUpdater, register, DAY };
