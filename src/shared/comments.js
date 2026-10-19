'use strict';

// The "title" of a section is the first meaningful line of the comment block right above
// its header, ignoring separator lines such as ";-----" or "#=====".
// `marker` is the comment character: ';' for CNS and AIR, '#' for ZSS.
function titleAbove(lines, index, marker) {
	const isComment = text => text.trim().startsWith(marker);

	const block = [];
	for (let i = index - 1; i >= 0 && isComment(lines[i]); i--) {
		block.unshift(lines[i]);
	}
	for (const raw of block) {
		let text = raw.trim();
		while (text.startsWith(marker)) text = text.slice(1);
		text = text.trim();
		if (text && !/^[-=_*#~\s]+$/.test(text)) {
			return text.length > 60 ? text.slice(0, 57) + '...' : text;
		}
	}
	return '';
}

module.exports = { titleAbove };
