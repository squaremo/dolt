'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var noodle = require('noodle');
var promisify = require('promisify');
var fs = promisify.object({
    writeFile: promisify.cb_func(),
    readFile: promisify.cb_func()
})(require('fs'));

function Table(stream, columns) {
    this.stream = stream;
    this.columns = columns;
}

Table.prototype.serialize = function () {
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

Table.deserialize = function (json) {
    return new Table(noodle.array(json.rows), json.columns);
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
    this.history = fs.readFile("/tmp/history.json").then(function (data) {
        return JSON.parse(data);
    }, function (err) {
        if (err.code === 'ENOENT')
            return [];
        else
            throw err;
    }).then(function (history) {
        return history.map(function (entry) {
            if (entry.result && entry.result.type === 'table'
                && entry.result.value)
                entry.result.value = Table.deserialize(entry.result.value);

            return entry;
        });
    });
}

Session.prototype.saveHistory = function () {
    if (this.saving_history) {
        // We were already saving the history.  Mark that it needs
        // saving again.
        this.saving_history = "again";
        return;
    }

    this.saving_history = true;

    var self = this;
    function writeHistory() {
        self.historyJson().then(function (json) {
            return fs.writeFile("/tmp/history.json", JSON.stringify(json));
        }).then(function () {
            if (self.saving_history === "again") {
                self.saving_history = true;
                writeHistory();
            }
            else {
                self.saving_history = false;
            }
        });
    }

    writeHistory();
}

// Make a copy of a history entry, setting the result.value of the copy. */
function history_entry_with_value(entry, val) {
    var copy = {};
    for (var p in entry) { copy[p] = entry[p]; }
    copy.result = { type: entry.result.type, value: val };
    return copy;
}

Session.prototype.eval = function (expr) {
    var self = this;
    var history_entry = {
        expr: expr,
        in_progress: true
    };

    return this.history.then(function (history) {
        // Set up the environment for the evaluation
        var params = [];
        var args = [];

        function bind(name, val) {
            params.push(name);
            args.push(val);
        }

        for (var i in env) { bind(i, env[i]); }

        var dollar;
        for (var i = 0; i < history.length; i++) {
            if (!history[i].error) {
                dollar = history[i].result.value;
                bind("$" + (i + 1), dollar);
            }
        }

        bind("$", dollar);

        params.push("return (" + expr + ")");

        history_entry.variable = '$' + (history.length + 1);
        history.push(history_entry);

        // Evaluate
        var val = Function.apply(null, params).apply(null, args);
        history_entry.result = { value: val };
        if (isTable(val)) {
            history_entry.result.type = 'table';
            val = val.serialize();
        }
        else {
            history_entry.result.type = 'ground';
        }

        self.saveHistory();
        return val;
    }).then(function (val) {
        history_entry.in_progress = false;
        if (history_entry.result.type === 'ground')
            history_entry.result.value = val;

        self.saveHistory();

        // Trying to turn a Buffer into JSON is a bad idea
        if (Buffer.isBuffer(val))
            val = val.toString('base64');

        // Replace the Table/Promise with the jsonable value
        return history_entry_with_value(history_entry, val);
    }, function (err) {
        delete history_entry.result;
        history_entry.error = err.toString();
        history_entry.in_progress = false;
        self.saveHistory();
        return history_entry;
    });
};

Session.prototype.historyJson = function () {
    return this.history.then(function (history) {
        return when.all(history.map(function (entry) {
            if (entry.error) {
                return entry;
            }
            else if (entry.in_progress) {
                // Evaluation is still in progress, so punt
                return history_entry_with_value(entry, undefined);
            }
            else {
                var val = entry.result.value;
                if (isTable(val))
                    val = val.serialize();

                return when(val, function (val) {
                    // Trying to turn a Buffer into JSON is a bad idea
                    if (Buffer.isBuffer(val))
                        val = val.toString('base64');

                    return history_entry_with_value(entry, val);
                });
            }
        }));
    });
};

module.exports = Session;
