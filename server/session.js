'use strict';

var when = require('when');
var uuid = require('node-uuid');
var misc = require('./misc');
var util = require('util');
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
    this.file = '/tmp/session-' + id + '.json';
    this.toplevel = new interp.Environment(interp.builtins);
    for (var p in builtins) { this.toplevel.bind(p, builtins[p]); }

    var self = this;
    this.state = fs.readFile(this.file).then(function (data) {
        return JSON.parse(data);
    }, function (err) {
        if (err.code === 'ENOENT')
            return {history: [], global: {}};
        else
            throw err;
    }).then(function (state) {
        var history = state.history;
        for (var i = 0; i < history.length; i++)
            if (history[i].result)
                self.toplevel.bind(history[i].variable,
                                   interp.IValue.decodeJSON(history[i].result));
        // This relies on the environment mutating the frame given it,
        // so that we can have it in the state *and* as the global
        // object.
        self.env = new GlobalEnvironment(self.toplevel, state.global);
        return state;
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

Session.prototype.saveState = function () {
    if (this.saving_state) {
        // We were already saving the history.  Mark that it needs
        // saving again.
        this.saving_state = "again";
        return;
    }

    this.saving_state = true;

    var self = this;
    function writeState() {
        return Session.stringify(self.state).then(function (stateStr) {
            return fs.writeFile(self.file, stateStr);
        }).then(function () {
            if (self.saving_state === "again") {
                self.saving_state = true;
                writeState();
            }
            else {
                self.saving_state = false;
            }
        });
    }

    return writeState();
}

Session.enumSessions = function () {
    return fs.readdir('/tmp').then(function(files) {
        var ids = [];
        files.forEach(function(path) {
            var match = /^session-(.+)\.json$/.exec(path);
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

    return this.state.then(function (state) {
        var history = state.history;
        var history_entry = {
            expr: expr,
            in_progress: true,
            variable: '$' + (history.length + 1)
        };

        history.push(history_entry);
        console.log("Saving: " + self.id);
        self.saveState();

        var d = when.defer();

        interp_util.runFully(self.env, expr, function (status, json) {
            self.toplevel.bind(history_entry.variable, json); // %% in error case too?
            if (status === 'incomplete') {
                history_entry.result = interp_util.resolveSequences(json);
                self.saveState();
            }
            else if (status === 'complete') {
                history_entry.in_progress = false;
                history_entry.result = interp_util.resolveSequences(json);
                self.saveState();
                d.resolve(history_entry);
            }
            else {
                history_entry.in_progress = false;
                history_entry.error = status.toString();
                self.saveState();
                d.resolve(history_entry);
            }
        });

        return d.promise;
    });
};

module.exports = Session;

function GlobalEnvironment(toplevel, global) {
    GlobalEnvironment.super_.call(this, toplevel, global);
}
util.inherits(GlobalEnvironment, interp.Environment);
