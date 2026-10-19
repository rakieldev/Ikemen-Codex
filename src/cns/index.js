'use strict';

const outline = require('./outline');
const features = require('./features');

function register(context) {
	outline.register(context);
	features.register(context);
}

module.exports = { register };
