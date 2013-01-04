'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var promisify = require('promisify');
var fs = promisify.object({
    writeFile: promisify.cb_func(),
    readFile: promisify.cb_func(),
    readdir: promisify.cb_func()
})(require('fs'));
var interp = require('./interp');
var interp_util = require('./interp_util');

// The environment exposed to evaluated expressions.  We'll leave
// 'table' as the entry point to the stream operators, e.g.,
// project/select/equijoin.
var builtins = {
    get: interp.promised_builtin(misc.get),
    post: interp.promised_builtin(misc.post)
};

function Session(id) {
    this.id = id;
    this.file = '/tmp/history-' + id + '.json';
    this.env = new interp.Environment(interp.builtins);
    for (var p in builtins) { this.env.bind(p, builtins[p]); }

    var self = this;
    this.history = fs.readFile(this.file).then(function (data) {
        return JSON.parse(data);
    }, function (err) {
        if (err.code === 'ENOENT')
            return [];
        else
            throw err;
    }).then(function (history) {
        for (var i = 0; i < history.length; i++)
            if (history[i].result)
                self.env.bind(history[i].variable,
                              interp.IValue.decodeJSON(history[i].result));

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
        return Session.stringify(self.history).then(function (history) {
            return fs.writeFile(self.file, history);
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

    return writeHistory();
}

Session.enumSessions = function () {
    return fs.readdir('/tmp').then(function(files) {
        var ids = [];
        files.forEach(function(path) {
            var match = /^history-(.+)\.json$/.exec(path);
            if (match) { ids.push({id: match[1]}); }
        });
        return ids;
    });
};

Session.newSession = function () {
    var id = uuid.v1();
    return new Session(id);
}

Session.fromId = function (id) {
    return new Session(id);
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
        console.log("Saving: " + self.id);
        self.saveHistory();

        var d = when.defer();

        interp_util.runFully(self.env, history_entry.variable, expr,
                             function (status, json) {
            if (status === 'incomplete') {
                history_entry.result = interp_util.resolveSequences(json);
                self.saveHistory();
            }
            else if (status === 'complete') {
                history_entry.in_progress = false;
                history_entry.result = interp_util.resolveSequences(json);
                self.saveHistory();
                d.resolve(history_entry);
            }
            else {
                history_entry.in_progress = false;
                history_entry.error = status.toString();
                self.saveHistory();
                d.resolve(history_entry);
            }
        });

        return d.promise;
    });
};

module.exports = Session;
