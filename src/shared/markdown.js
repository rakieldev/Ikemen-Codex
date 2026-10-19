'use strict';

// Builds the Markdown text of the documentation boxes (autocomplete details and hover)
// from the generated data. Shared by the CNS and ZSS features.

function originLabel(e) {
	const parts = [];
	if (!e.tags.includes('old')) parts.push('Ikemen GO');
	if (e.nightly) parts.push('nightly');
	if (e.experimental) parts.push('experimental');
	if (e.deprecated) parts.push('deprecated');
	return parts.join(', ');
}

function sctrlDoc(s) {
	let md = s.description || '';
	const req = s.params.filter(p => p.required && !p.aliasOf).map(p => '`' + p.name + '`');
	if (req.length) md += (md ? '\n\n' : '') + '**Required:** ' + req.join(', ');
	const optional = s.params.filter(p => !p.required && !p.deprecated && !p.inferred && !p.aliasOf).length;
	if (optional) md += (req.length ? '\n\n' : (md ? '\n\n' : '')) + '+ ' + optional + ' optional parameter' + (optional > 1 ? 's' : '') + '.';
	if (s.inheritsFrom) md += '\n\n*Parameters shared with ' + s.inheritsFrom + '.*';
	if (s.changeNotes && s.changeNotes.length) {
		md += '\n\n---\n\n**Ikemen GO changes:**\n\n' + s.changeNotes.join('\n\n');
	}
	return md;
}

function paramDoc(p) {
	let head = '**' + p.name + '**';
	if (p.type) head += ' `' + p.type + '`';
	head += p.required ? ' · required' : ' · optional';
	if (p.since && p.since !== 'old') head += ' · Ikemen GO';
	if (p.nightly) head += ' (nightly)';
	if (p.deprecated) head += ' · deprecated';
	let md = head;
	if (p.placeholder) md += '\n\n`' + p.name + ' = ' + p.placeholder + '`';
	if (p.description) md += '\n\n' + p.description;
	if (p.changeNote) md += '\n\n**Ikemen GO:** ' + p.changeNote;
	return md;
}

function triggerDoc(t) {
	let md = t.description || '';
	if (t.format) md += (md ? '\n\n' : '') + '**Format:** `' + t.format + '`';
	if (t.returns) md += '\n\n**Returns:** ' + t.returns;
	return md;
}

module.exports = { originLabel, sctrlDoc, paramDoc, triggerDoc };
