'use strict';

// Small helpers shared by the CNS and ZSS snippet builders.

// Escapes characters that are special inside a VS Code snippet.
function esc(s) {
	return String(s).replace(/[\\$}]/g, '\\$&');
}

// Heading-only parameters require an explicit review before template insertion.
function isTemplateParam(p) {
	return !p.deprecated && !p.aliasOf && (!p.inferred || p.includeInTemplate === true);
}

// True when a controller has optional parameters eligible for the full template
function hasOptional(s) {
	return s.params.some(p => !p.required && isTemplateParam(p));
}

module.exports = { esc, hasOptional, isTemplateParam };
