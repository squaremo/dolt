// Miscellaneous utility bits and pieces

'use strict';

var when = require('when');
var urlmod = require('url');

var protocols = {
    'http:': require('http'),
    'https:': require('https')
};

// Read everything from a binary read stream, and return it in a
// promised Buffer
function readAll(stream) {
    var d = when.defer();

    var chunks = [];
    stream.on("data", function (chunk) { chunks.push(chunk); });
    stream.on("end", function () {
        if (d) {
            d.resolve(chunks);
            d = null;
            chunks = null;
        }
    });
    stream.on("close", function (err) {
        if (d) {
            d.reject(err);
            d = null;
            chunks = null;
        }
    });

    return d.promise.then(function (chunks) { return Buffer.concat(chunks); });
}

// Do an HTTP request, returning the promised response as-is
function bareHttpRequest(method, url, headers, body, redirect_count) {
    var opts = urlmod.parse(url);
    opts.method = method;
    opts.headers = headers || {};

    // XXX send Accept header
    var proto = protocols[opts.protocol];
    if (!proto) {
        return when.reject("unsupported protocol '" + opts.protocol + "'");
    }

    var d = when.defer();
    var req = proto.request(opts, function (res) {
        d.resolve(readAll(res).then(function (body) {
            res.body = body;
            return res;
        }));
    });

    if (body) { req.write(body); }
    req.end();

    return d.promise;
}

// Do an HTTP request, returning the promised parsed response
function httpRequest(method, url, headers, body, redirect_count) {
    return bareHttpRequest(method, url, headers, body).then(function (res) {
        var status = res.statusCode;
        if (status >= 200 && status <= 299) {
            return parseBody(res);
        } else if (status >= 300 && status <= 399 && res.headers.location) {
            // Redirect
            if (redirect_count == 5) {
                throw new Error("Too many redirects");
            } else {
                return httpRequest(method, res.headers.location, headers,
                                   body, (redirect_count || 0) + 1);
            }
        } else {
            throw new Error("Response status " + status);
        }
    });
}

var mediaTypeHandlers = {
    'text': {
        'plain': function (res, ct) {
            return res.bodyAs(ct.charset || 'US-ASCII');
        },
        'html': function (res, ct) {
            // XXX should implement the HTML5 charset detection algorithm here
            return res.bodyAs(ct.charset || 'UTF-8');
        }
    },
    'application': {
        'json': function (res, ct, bodyas) {
            return JSON.parse(res.bodyAs(ct.charset || 'UTF-8'));
        }
    }
};

// Convert a MIME charset name to a node.js encoding name
var charsetToEncoding = {
    'UTF-8': 'utf8',
    'US-ASCII': 'ascii'
};

function parseBody(res) {
    res.bodyAs = function (charset) {
        var enc = charsetToEncoding[charset.toUpperCase()];
        if (enc) {
            return this.body.toString(enc);
        } else {
            return this.body;
        }
    };

    var ct = res.headers['content-type'];
    ct = (ct ? parseContentType(ct) : {});
    var handler = mediaTypeHandlers[ct.type][ct.subtype];
    if (handler) {
        return handler(res, ct);
    } else {
        return res.body;
    }
}

var CT_token_chars = '[^\\x00-\\x1f\\x7f()<>@,;:\\"/\\[\\]?={} \\t]+';
var CT_ws = '[ \\t]*';
var CT_media_type_re = new RegExp(CT_ws+'('+CT_token_chars+')/('+CT_token_chars+')'+CT_ws, 'g');
var CT_param_re = new RegExp(';'+CT_ws+'('+CT_token_chars+')=("|'+CT_token_chars+')('+CT_ws+')', 'g');
var CT_value_re = new RegExp('('+CT_token_chars+')'+CT_ws, 'g');
var CT_quoted_value_re = new RegExp('((?:[^\\\\"]|\\\\.)*)"'+CT_ws, 'g');

function parseContentType(ct) {
    var pos = 0;

    function accept(re) {
        re.lastIndex = pos;
        var m = re.exec(ct);
        if (!m || m.index != pos) {
            throw new Error("bad Content-Type header: " + ct);
        }
        pos = re.lastIndex;
        return m;
    }

    var res = {};
    var m = accept(CT_media_type_re);
    res.type = m[1];
    res.subtype = m[2];

    while (pos != ct.length) {
        m = accept(CT_param_re);
        var val = m[2];
        if (val == '"') {
            val = m[3] + accept(CT_quoted_value_re)[1].replace(/\\./, function (q) { return q[1]; });
        }
        res[m[1]] = val;
    }

    return res;
}

// Do a GET, returning the promised JSON response
function get(url) {
    return httpRequest('GET', url);
}

// Do a POST, returning the promised JSON response
function post(url, body) {
    var headers = {}

    if (typeof(body) === 'undefined') {
        body = new Buffer(0);
    } else if (typeof(body) === 'string') {
        body = new Buffer(body, "utf8");
        headers['Content-Type'] = 'text/plain; charset=UTF-8';
    } else {
        body = new Buffer(JSON.stringify(body, "utf8"));
        headers['Content-Type'] = 'application/json; charset=UTF-8';
    }

    headers['Content-Length'] = body.length;
    return httpRequest('POST', url, headers, body);
}

module.exports.readAll = readAll;
module.exports.post = post;
module.exports.get = get;
module.exports.parseContentType = parseContentType;
