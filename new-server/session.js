'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');

// The environment exposed to evaluated expressions
var env = {
    get: misc.get,
    post: misc.post
};

function Session() {
    this.id = uuid.v1();
    this.results = [];
}

Session.prototype.eval = function (expr) {
    var self = this;
    var params = [];
    var args = [];

    for (var i in env) {
        params.push(i);
        args.push(env[i]);
    }

    for (var i = 0; i < this.results.length; i++) {
        params.push("$" + (i + 1));
        args.push(this.results[i]);
    }

    params.push("return (" + expr + ")");

    return when(null, function () {
        return Function.apply(null, params).apply(null, args);
    }).then(function (res) {
        self.results.push(res);
        return { value: res, variable: '$' + self.results.length };
    }, function (err) {
        return { error: err.toString() };
    });
};

module.exports = Session;
