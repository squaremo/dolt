'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var promisify = require('promisify');
var fs = promisify.object({
    writeFile: promisify.cb_func(),
    readFile: promisify.cb_func()
})(require('fs'));
var Table = require('./tables');
var isTable = Table.isTable;
var interp = require('./interp');

// The environment exposed to evaluated expressions.  We'll leave
// 'table' as the entry point to the stream operators, e.g.,
// project/select/equijoin.
var builtins = {
    get: interp.promised_builtin(misc.get),
    post: interp.promised_builtin(misc.post)
    //table: Table.table
};

function Session() {
    this.id = uuid.v1();
    this.env = new interp.Environment(interp.builtins);
    for (var p in builtins) { this.env.bind(p, builtins[p]); }

    var self = this;
    this.history = fs.readFile("/tmp/history.json").then(function (data) {
        return JSON.parse(data);
    }, function (err) {
        if (err.code === 'ENOENT')
            return [];
        else
            throw err;
    }).then(function (history) {
        for (var i = 0; i < history.length; i++)
            if (history[i].result)
                self.env.bind(history[i].variable, history[i].result.value);

        return history;
    });
}

Session.stringify = function (data) {
    return when(data, function (data) {
        return JSON.stringify(data, function (prop, val) {
            if (Buffer.isBuffer(val))
                return val.toString('base64');
            else
                return val;
        });
    });
};

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
        Session.stringify(self.history).then(function (history) {
            return fs.writeFile("/tmp/history.json", history);
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

Session.prototype.eval = function (expr) {
    var self = this;

    return this.history.then(function (history) {
        var history_entry = {
            expr: expr,
            in_progress: true,
            variable: '$' + (history.length + 1)
        };

        history.push(history_entry);
        self.saveHistory();

        var d = when.defer();
        self.env.run(expr, function (val) {
            self.env.bind(history_entry.variable, val);
            history_entry.in_progress = false;
            history_entry.result = { type: 'ground', value: val };
            self.saveHistory();
            d.resolve(history_entry);
        }, function (err) {
            history_entry.in_progress = false;
            history_entry.error = err.toString();
            self.saveHistory();
            d.resolve(history_entry);
        });

        return d.promise;
    });
};

module.exports = Session;
