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

// The environment exposed to evaluated expressions.  We'll leave
// 'table' as the entry point to the stream operators, e.g.,
// project/select/equijoin.
var env = {
    get: misc.get,
    post: misc.post,
    table: table
};

function Session() {
    this.id = uuid.v1();
    this.history = [];
}

function merge(a, b) {
    var res = {};
    for (var p in a) { res[p] = a[p]; }
    for (var p in b) { res[p] = b[p]; }
    return res;
}

Session.prototype.eval = function (expr) {
    var params = [];
    var args = [];

    function bind(name, val) {
        params.push(name);
        args.push(val);
    }

    for (var i in env) { bind(i, env[i]); }

    var dollar;
    for (var i = 0; i < this.history.length; i++) {
        dollar = this.history[i].value;
        bind("$" + (i + 1), dollar);
    }

    bind("$", dollar);

    params.push("return (" + expr + ")");

    var history_entry = {
        expr: expr,
        variable: '$' + (this.history.length + 1),
        in_progress: true
    };
    this.history.push(history_entry);

    // Running the expression will either generate a value, a promise,
    // or a stream. If it's a stream, and we want to refer to the
    // stream later, we have to store it as a stream rather than
    // realising it. If it's a promise, we want to wait for the value
    // then store that.

    return when(null, function () {
        var res = Function.apply(null, params).apply(null, args);
        if (noodle.isStream(res)) {
            history_entry.value = res;
            return res.collect();
        }
        else {
            return when(res, function(realres) {
                history_entry.value = realres;
                return realres;
            });
        }
    }).then(function (res) {
        history_entry.in_progress = false;

        // Trying to turn a Buffer into JSON is a bad idea
        if (Buffer.isBuffer(res))
            res = res.toString('base64');

        return merge(history_entry, {value: res});
    }, function (err) {
        delete history_entry.value;
        history_entry.error = err.toString();
        history_entry.in_progress = false;
        return history_entry;
    });
};

Session.prototype.historyJson = function () {
    return when.all(this.history.map(function (entry) {
        if (entry.in_progress)
            // Evaluation is still in progress, so punt
            return merge(entry, {value: undefined});
        else if (noodle.isStream(entry.value))
            // Evaluation is done, but we still have to do this dance
            // to get the value out of a stream
            return entry.value.collect().then(function (val) {
                return merge(entry, {value: val});
            });
        else
            return entry;
    }));
};

module.exports = Session;
