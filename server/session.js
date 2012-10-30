'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var noodle = require('noodle');

function Table(stream, columns) {
    this.stream = stream;
    this.columns = columns;
}

Table.prototype.serialize = function() {
    var cols = this.columns;
    var stream = this.stream;
    if (cols)
        stream = stream.project(cols);

    return when(stream.collect(), function(data) {
        if (cols === undefined) {
            cols = inferColumns(data);
        }
        return {
            rows: data,
            columns: cols
        };
    });
};

function inferColumns(data) {
    // Find the set of keys from the data elements
    var keys = {};
    for (var i = 0; i < data.length; i++) {
        for (var k in data[i]) {
            keys[k] = true;
        }
    }

    // Turn that set into a sorted list
    var cols = [];
    for (var k in keys) {
        cols.push(k);
    }
    cols.sort();
    return cols;
}

function isTable(value) {
    return value instanceof Table;
}

// Tablize a value, returning a stream with the columns given.
function table(something, columnsInOrder) {
    function streamize(val) {
        if (typeof(val) === 'object') {
            if (when.isPromise(val)) {
                return noodle.asPromised(when(val, streamize));
            }
            else if (isTable(val)) {
                return val.stream;
            }
            else if (Array.isArray(val)) {
                return noodle.array(val);
            }
        }

        // This doesn't really work, as columns will be inferred as
        // empty.
        return noodle.values(val);
    }

    return new Table(streamize(something), columnsInOrder);
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
        dollar = this.history[i].result;
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

        if (isTable(res)) {
            history_entry.result = res;
            return when(res.serialize(), function(realres) {
                return {type: 'table', value: realres};
            });
        }
        else {
            return when(res, function(realres) {
                history_entry.result = realres;
                return {type: 'ground', value: realres};
            });
        }
    }).then(function (res) {
        history_entry.in_progress = false;

        // Trying to turn a Buffer into JSON is a bad idea
        if (Buffer.isBuffer(res.value))
            res.value = res.value.toString('base64');

        return merge(history_entry, {result: res});
    }, function (err) {
        delete history_entry.result;
        history_entry.error = err.toString();
        history_entry.in_progress = false;
        return history_entry;
    });
};

Session.prototype.historyJson = function () {
    return when.all(this.history.map(function (entry) {
        if (entry.in_progress)
            // Evaluation is still in progress, so punt
            return merge(entry, {result: undefined});
        // Evaluation is done, but we still have to do this dance
        // to get the value out of a stream or table
        else if (noodle.isStream(entry.result))
            return entry.result.collect().then(function (data) {
                return merge(entry, {result: {type: 'ground', value: data}});
            });
        else if (isTable(entry.result))
            return entry.result.serialize().then(function (val) {
                return merge(entry, {result: {type: 'table', value: val}});
            });
        else
            return merge(entry, {result: {type: 'ground', value: entry.result}});;
    }));
};

module.exports = Session;
