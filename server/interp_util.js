// Bits that aren't part of the interpreter proper, but are closely
// associated with it.

'use strict';

var interp = require('./interp');
var util = require('util');

// Evaluate an expression, waiting until all the lazies have resolved.
function Evaluation() {
}

util.inherits(Evaluation, require('events').EventEmitter);

Evaluation.prototype.evaluate = function (env, expr, variable) {
    var self = this;

    if (this.json !== undefined)
        throw new Error("Evaluation already used");

    // This maps lazy ids to a representation of their position in the
    // result JSON, so that we can substitute the resolved values as
    // they arrive.
    var lazies = {};

    // A flag to ensure we don't make further callbacks after an
    // error.
    var errored = false;

    try {
        this.json = env.run(expr, variable, function (id, err, val) {
            if (err) {
                errored = true;
                self.emit('error', err);
            }
            else {
                // Replace the lazy with the value
                lazies[id](val);
                delete lazies[id];
                emitCurrentJSON();
            }
        });

        registerLazies(this, 'json');
        emitCurrentJSON();
    }
    catch (err) {
        if (!errored) {
            errored = true;
            this.emit('error', err);
        }
    }

    // Find any lazies in the JSON at parent[under] and add them to
    // 'lazies'.  We need the parent so that we can replace the
    // reference to the lazy with the resolved value.
    function registerLazies(parent, under) {
        var val = parent[under];
        if (typeof(val) !== 'object' || val === null)
            return;

        if (val['!'] !== 'lazy') {
            if (val instanceof Array) {
                for (var i = 0; i < val.length; i++)
                    registerLazies(val, i);
            }
            else {
                for (var p in val)
                    if (interp.hasOwnProperty(val, p))
                        registerLazies(val, p);
            }
        }
        else {
            lazies[val.id] = function (resolved) {
                parent[under] = resolved;

                // The resolved value might itself contain lazies
                registerLazies(parent, under);
            };
        }
    }

    function emitCurrentJSON() {
        if (errored)
            return;

        self.emit('update');

        var done = true;
        for (var p in lazies) {
            done = false;
            break;
        }

        if (done)
            self.emit('done');
    }
};

// Convert 'cons' specials in the given extended JSON into arrays
function resolveSequences(val) {
    if (typeof(val) === 'object' && val !== null && val['!'] === 'cons') {
        var tail = val.tail = resolveSequences(val.tail);
        if (tail instanceof Array) {
            tail.unshift(val.head);
            return tail;
        }
    }

    return val;
}

module.exports.Evaluation = Evaluation;
module.exports.resolveSequences = resolveSequences;
