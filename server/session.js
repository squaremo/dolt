'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var noodle = require('noodle');

// Tablise a value, returning a stream.
function table(val) {
    switch (typeof val) {
    case 'string':
        newval = JSON.parse(val);
        if (typeof newval !== 'string') return table(newval);
        // Um.
        return noodle.values(newval); // %% this may just be confusing.
    case 'object':
        if (when.isPromise(val)) {
            return noodle.asPromised(
                when(val, function(s) { return table(s); }));
        }
        else {
            return (Array.isArray(val)) ?
                noodle.array(val) :
                noodle.values(val);
        }
    default:
        return noodle.values(val); // again, confusing?
    }
}

// The environment exposed to evaluated expressions
var env = {
    get: misc.get,
    post: misc.post,
    table: table,
    map: noodle.map,
    filter: noodle.filter,
    zipWith: noodle.zipWith,
};

// for (var k in noodle) {
//     console.log('Adding ' + k + ' to env');
//     env[k] = promisify(noodle[k]); // %% NIL?
// }

function Session() {
    this.id = uuid.v1();
    this.results = [];
}

Session.prototype.eval = function (expr) {
    var self = this;
    var params = [];
    var args = [];

    function bind(name, val) {
        params.push(name);
        args.push(val);
    }

    for (var i in env) { bind(i, env[i]); }

    var dollar;
    for (var i = 0; i < this.results.length; i++) {
        dollar = this.results[i];
        bind("$" + (i + 1), dollar);
    }

    bind("$", dollar);

    params.push("return (" + expr + ")");

    // Running the expression will either generate a value, a promise,
    // or a stream. If it's a stream, and we want to refer to the
    // stream later, we have to store it as a stream rather than
    // realising it. If it's a promise we want to wait for the value
    // then store that.

    return when(null, function () {
        var res = Function.apply(null, params).apply(null, args);
        var dollar = self.results.length;
        self.results[dollar] = undefined;
        if (noodle.isStream(res)) {
            self.results[dollar] = res;
            return res.collect();
        }
        else if (when.isPromise(res)) {
            res.then(function(realres) { self.results[dollar] = realres; });
            return res;
        }
        else {
            self.results[dollar] = res;
            return res;
        }
    }).then(function (res) {
        return { value: res, variable: '$' + self.results.length };
    }, function (err) {
        return { error: err.toString() };
    });
};

module.exports = Session;
