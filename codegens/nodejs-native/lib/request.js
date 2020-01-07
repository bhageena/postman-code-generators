const _ = require('./lodash'),
  sanitizeOptions = require('./util').sanitizeOptions,
  addFormParam = require('./util').addFormParam,

  parseRequest = require('./parseRequest');
var self;

/**
 * retuns snippet of nodejs(native) by parsing data from Postman-SDK request object
 *
 * @param {Object} request - Postman SDK request object
 * @param {String} indentString - indentation required for code snippet
 * @param {Object} options
 * @returns {String} - nodejs(native) code snippet for given request object
 */
function makeSnippet (request, indentString, options) {
  var nativeModule = (request.url.protocol === 'http' ? 'http' : 'https'),
    snippet = `const ${nativeModule} = require('${nativeModule}');\n`,
    optionsArray = [],
    postData = '';

  if (options.followRedirect) {
    snippet = `const ${nativeModule} = require('follow-redirects').${nativeModule};\n`;
  }
  snippet += 'const fs = require(\'fs\');\n\n';
  if (_.get(request, 'body.mode') && request.body.mode === 'urlencoded') {
    snippet += 'const qs = require(\'querystring\');\n\n';
  }

  snippet += 'const options = {\n';

  /**
     * creating string to represent options object using optionArray.join()
     * example:
     *  options: {
     *      method: 'GET',
     *      hostname: 'www.google.com',
     *      path: '/x?a=10',
     *      headers: {
     *          'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
     *      }
     *  }
     */

  // The following code handles multiple files in the same formdata param.
  // It removes the form data params where the src property is an array of filepath strings
  // Splits that array into different form data params with src set as a single filepath string
  if (request.body && request.body.mode === 'formdata') {
    let formdata = request.body.formdata,
      formdataArray = [];
    formdata.members.forEach((param) => {
      let key = param.key,
        type = param.type,
        disabled = param.disabled,
        contentType = param.contentType;
      // check if type is file or text
      if (type === 'file') {
        // if src is not of type string we check for array(multiple files)
        if (typeof param.src !== 'string') {
          // if src is an array(not empty), iterate over it and add files as separate form fields
          if (Array.isArray(param.src) && param.src.length) {
            param.src.forEach((filePath) => {
              addFormParam(formdataArray, key, param.type, filePath, disabled, contentType);
            });
          }
          // if src is not an array or string, or is an empty array, add a placeholder for file path(no files case)
          else {
            addFormParam(formdataArray, key, param.type, '/path/to/file', disabled, contentType);
          }
        }
        // if src is string, directly add the param with src as filepath
        else {
          addFormParam(formdataArray, key, param.type, param.src, disabled, contentType);
        }
      }
      // if type is text, directly add it to formdata array
      else {
        addFormParam(formdataArray, key, param.type, param.value, disabled, contentType);
      }
    });
    request.body.update({
      mode: 'formdata',
      formdata: formdataArray
    });
  }
  if (request.body && request.body[request.body.mode]) {
    postData += parseRequest.parseBody(request.body.toJSON(), indentString, options.trimRequestBody,
      request.headers.get('Content-Type'));
  }
  if (request.body && !request.headers.has('Content-Type')) {
    if (request.body.mode === 'file') {
      request.addHeader({
        key: 'Content-Type',
        value: 'text/plain'
      });
    }
    else if (request.body.mode === 'graphql') {
      request.addHeader({
        key: 'Content-Type',
        value: 'application/json'
      });
    }
  }

  parseRequest.parseURLVariable(request);

  optionsArray.push(indentString + `'method': '${request.method}'`);
  optionsArray.push(parseRequest.parseHost(request, indentString));
  if (request.url.port) {
    optionsArray.push(parseRequest.parsePort(request, indentString));
  }
  optionsArray.push(parseRequest.parsePath(request, indentString));
  optionsArray.push(parseRequest.parseHeader(request, indentString));
  if (options.followRedirect) {
    optionsArray.push(indentString + '\'maxRedirects\': 20');
  }

  snippet += optionsArray.join(',\n') + '\n';
  snippet += '};\n\n';
  snippet += 'const main = (args) => {\n\n';
  snippet += `let req = ${nativeModule}.request(options, function (res) {\n`;

  snippet += indentString + 'let chunks = [];\n\n';
  snippet += indentString + 'res.on("data", function (chunk) {\n';
  snippet += indentString.repeat(2) + 'chunks.push(chunk);\n';
  snippet += indentString + '});\n\n';

  snippet += indentString + 'res.on("end", function (chunk) {\n';
  snippet += indentString.repeat(2) + 'let body = Buffer.concat(chunks);\n';
  snippet += indentString.repeat(2) + 'console.log(body.toString());\n';
  snippet += indentString + '});\n\n';

  snippet += indentString + 'res.on("error", function (error) {\n';
  snippet += indentString.repeat(2) + 'console.error(error);\n';
  snippet += indentString + '});\n';

  snippet += '});\n\n';

  if (request.body && !(_.isEmpty(request.body)) && postData.length) {
    snippet += `let postData = ${postData};\n\n`;

    if (request.method === 'DELETE') {
      snippet += 'req.setHeader(\'Content-Length\', postData.length);\n\n';
    }

    if (request.body.mode === 'formdata') {
      snippet += 'req.setHeader(\'content-type\',' +
            ' \'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW\');\n\n';
    }

    snippet += 'req.write(postData);\n\n';
  }

  if (options.requestTimeout) {
    snippet += `req.setTimeout(${options.requestTimeout}, function() {\n`;
    snippet += indentString + 'req.abort();\n';
    snippet += '});\n\n';
  }

  snippet += 'req.end();';
  snippet += '\n};\n\n';
  snippet += '\n\n exports.main = main;';
  return snippet;
}

/**
 * Converts Postman sdk request object to nodejs native code snippet
 *
 * @param {Object} request - postman-SDK request object
 * @param {Object} options
 * @param {String} options.indentType - type for indentation eg: Space, Tab
 * @param {String} options.indentCount - number of spaces or tabs for indentation.
 * @param {Boolean} options.followRedirect - whether to enable followredirect
 * @param {Boolean} options.trimRequestBody - whether to trim fields in request body or not
 * @param {Number} options.requestTimeout : time in milli-seconds after which request will bail out
 * @param {Function} callback - callback function with parameters (error, snippet)
 */
self = module.exports = {
  /**
     * Used to return options which are specific to a particular plugin
     *
     * @returns {Array}
     */
  getOptions: function () {
    return [{
      name: 'Set indentation count',
      id: 'indentCount',
      type: 'positiveInteger',
      default: 2,
      description: 'Set the number of indentation characters to add per code level'
    },
    {
      name: 'Set indentation type',
      id: 'indentType',
      type: 'enum',
      availableOptions: ['Tab', 'Space'],
      default: 'Space',
      description: 'Select the character used to indent lines of code'
    },
    {
      name: 'Set request timeout',
      id: 'requestTimeout',
      type: 'positiveInteger',
      default: 0,
      description: 'Set number of milliseconds the request should wait for a response' +
    ' before timing out (use 0 for infinity)'
    },
    {
      name: 'Follow redirects',
      id: 'followRedirect',
      type: 'boolean',
      default: true,
      description: 'Automatically follow HTTP redirects'
    },
    {
      name: 'Trim request body fields',
      id: 'trimRequestBody',
      type: 'boolean',
      default: false,
      description: 'Remove white space and additional lines that may affect the server\'s response'
    }];
  },

  convert: function (request, options, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('NodeJS-Request-Converter: callback is not valid function');
    }
    options = sanitizeOptions(options, self.getOptions());

    //  String representing value of indentation required
    var indentString;

    indentString = options.indentType === 'Tab' ? '\t' : ' ';
    indentString = indentString.repeat(options.indentCount);

    return callback(null, makeSnippet(request, indentString, options));
  }
};
