'use strict';

const outline = require('./outline');

function register(context) {
	outline.register(context);
}

module.exports = { register };
