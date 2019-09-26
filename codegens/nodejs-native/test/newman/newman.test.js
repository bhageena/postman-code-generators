var runNewmanTest = require('../../../../test/codegen/newman/newmanTestUtil').runNewmanTest,
  convert = require('../../lib/index').convert;

describe('Convert for different types of request', function () {
  var options = {indentCount: 2, indentType: 'Space'},
    testConfig = {
      headerSnippet: '/* eslint-disable */\n',
      compileScript: null,
      runScript: 'node run.js',
      fileName: 'run.js'
    };

  runNewmanTest(convert, options, testConfig);
});
