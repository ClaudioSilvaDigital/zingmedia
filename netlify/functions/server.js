const serverless = require('serverless-http');
const app = require('../../server-full.js');

module.exports.handler = serverless(app);