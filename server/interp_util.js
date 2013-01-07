// Bits that aren't part of the interpreter proper, but are closely
// associated with it.

'use strict';

var interp = require('./interp');

// Evaluate an expression, waiting until all the lazies have resolved.
//
// The callback is called with (status, json) where status is:
// - 'incomplete': There are still lazies to be resolved
// - 'complete': All lazies have been resolved, evaluation is finished.
// - An error object
function runFully(env, varname, expr, callback) {
    // This maps lazy ids to a representation of their position in the
    // result JSON, so that we can substitute the resolved values as
    // they arrive.
    var lazies = {};
    var aborted = false;

    // Find any lazies in the JSON at parent[under] and add them to
    // 'lazies'.  We need the parent so that we can replace the
    // reference to the lazy with the resolved value.
    function registerLazies(parent, under) {
        var val = parent[under];
        if (typeof(val) !== 'object')
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

    var res = env.run(varname, expr, function (id, err, val) {
        if (err) {
            aborted = true;
            callback(err);
        }

        // Replace the lazy with the value
        lazies[id](val);
        delete lazies[id];
        callCallback();
    });

    var res_holder = {res: res};

    function callCallback() {
        var status = 'complete';

        for (var p in lazies) {
            status = 'incomplete';
            break;
        }

        callback(status, res_holder.res);
    }

    registerLazies(res_holder, 'res');
    callCallback();
}

// Convert 'cons' specials in the given extended JSON into arrays
function resolveSequences(val) {
    if (typeof(val) === 'object' && val['!'] === 'cons') {
        var tail = val.tail = resolveSequences(val.tail);
        if (tail instanceof Array) {
            tail.unshift(val.head);
            return tail;
        }
    }

    return val;
}

module.exports.runFully = runFully;
module.exports.resolveSequences = resolveSequences;