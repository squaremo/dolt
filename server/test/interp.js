'use strict';

var interp = require('../interp');

function check(expr, expect) {
    return function (assert) {
        assert.expect(1);
        interp.builtins.runForJSON(expr, function (res, json) {
            assert.deepEqual(json, expect);
            assert.done();
        }, function (err) {
            // nodeunit doesn't do a good job of presenting exceptions
            // hat lack a stack trace.
            if (!err.stack)
                err = new Error(err.message);

            throw err;
        });
    };
};

module.exports.trivialAddition
    = check('1+2', 3);

module.exports.trivialFunCall
    = check('function foo(x) { x+1; } foo(42)', 43);

module.exports.katch
    = check('var ex; try { ex = (function () { throw "bang"; 42; })(); } catch (e) { ex = e; } ex;', 'bang');

module.exports.range = check('range(0,5)', [0,1,2,3,4]);
module.exports.rangeLazy = check('range(42,1000000)[0]', 42);

// map

module.exports.arrayMap
    = check('[1,2,3].map(_*2)', [2,4,6]);

// Here we discard the result of a lazy map, so the map expression
// should not be evaluated
module.exports.arrayMapLazy
    = check('var total = 0; function see(n) { total += n; n; }; [1,2,3].map(see(_)); total;', 0);

// Here we force the lazy map with toArray
module.exports.arrayMapLazyForced
    = check('var total = 0; function see(n) { total += n; n; }; [1,2,3].map(see(_)).toArray(); total', 6);

// Here we force only the head of a lazy map
module.exports.arrayMapLazyForcedHead
    = check('var total = 0; function see(n) { total += n; n; }; [1,2,3].map(see(_))[0]; total', 1);

// where

module.exports.arrayWhere
    = check('[1,20,2,30,3,15].where(10<_)', [20,30,15]);

// Here we discard the result of a lazy where, so the where expression
// should not be evaluated
module.exports.arrayWhereLazy
    = check('var total = 0; function see(n) { total += n; 10 < n; }; [5,15,20,5].where(see(_)); total;', 0);

// Here we force the lazy where with toArray
module.exports.arrayWhereLazyForced
    = check('var total = 0; function see(n) { total += n; 10 < n; }; [5,15,20,5].where(see(_)).toArray(); total;', 45);

// Here we force only the head of a lazy where
module.exports.arrayWhereLazyForcedHead
    = check('var total = 0; function see(n) { total += n; 10 < n; }; [5,15,20,5].where(see(_))[0]; total;', 20);
