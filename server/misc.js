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

// Do an HTTP request, returning the promised JSON response
function httpRequest(method, url, headers, body, redirect_count) {
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
        var status = res.statusCode;
        if (status >= 200 && status <= 299) {
            // XXX check that response is json
            d.resolve(readAll(res));
        } else if (status >= 300 && status <= 399 && res.headers.location) {
            // Redirect
            if (redirect_count == 5) {
                d.reject("Too many redirects");
            } else {
                d.resolve(httpRequest(method, res.headers.location, headers,
                                      body, (redirect_count || 0) + 1));
            }
        } else {
            d.reject("Response status " + status);
        }

    });

    if (body) { req.write(body); }
    req.end();

    return d.promise.then(function (res) {
        return JSON.parse(res.toString("utf8"));
    });
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
