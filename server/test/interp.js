'use strict';

var interp = require('../interp');

function check(expr, expect) {
    return function (assert) {
        assert.expect(1);
        var env = new interp.Environment(interp.builtins);
        env.runForJSON(expr, function (res, json) {
            // Compare JSON strings, because node's assert.deepEqual
            // does not check for strict equality
            assert.equal(JSON.stringify(json), JSON.stringify(expect));
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

// Check that we can provoke a 'runtime exception'; that is, something
// that breaks the interpreter rather than the interpretation. In
// general these are illegal program constructions, as opposed to
// operations on illegal values.
function checkError(expr) {
    return function(assert) {
        var env = new interp.Environment(interp.builtins);
        assert.throws(function() {
            env.run(expr, function(val) {
                assert.fail("Expected error; got value");
            });
            assert.fail("Expected interpreter error, but ran to completion");
        });
        assert.done();
    };
}

module.exports.preferObjectLiteral
    = check('{foo:"bar"}', {foo:"bar"});

module.exports.trivialAddition
    = check('1+2', 3);

module.exports.trivialFunCall
    = check('function foo(x) { x+1; }; foo(42)', 43);

module.exports.trivialReturn
    = check('function foo(x) { return x + 1; }; foo(4)', 5);

module.exports.earlyReturn
    = check('function early(x) { return x + 1; x + 2; }; early(8)', 9);

module.exports.katch
    = check('var ex; try { ex = (function () { throw "bang"; 42; })(); } catch (e) { ex = e; } ex;', 'bang');

module.exports.nestedKatch
    = check('var ex = 0; try { try { ex = 10;} catch (e) { ex = 42; }; throw 45; } catch (n) { ex = ex + 1; }; ex',
            11);

module.exports.objConstructorShortcut
    = check('var foo = 1; {foo}', {foo: 1});

module.exports.vardecl
    = check('var x = 100', {'!':'undefined'});

// object literals with properties that collide with the '!' type property
module.exports.objConstructorSpecial
    = check("{'!':1, '!!!': 2}", {'!!':1, '!!!!': 2});

module.exports.objHasOwnProperty
    = check("{hasOwnProperty: 1}", {hasOwnProperty: 1});

// sequences

// range

module.exports.range = check('range(0,5)', [0,1,2,3,4,5]);
module.exports.rangeLazy = check('range(42,1000000)[0]', 42);
module.exports.rangeStep = check('range(1, 10, 1)[9]', 10);
module.exports.rangeStep2 = check('range(0, 10, 2)', [0,2,4,6,8,10]);
module.exports.rangeRemainder = check('range(0,10,3)', [0,3,6,9]);
// No unary expression yet!
module.exports.rangeNegativeStep = check('range(10, 0, 0-2)', [10,8,6,4,2,0]);
module.exports.rangeNegativeRemainder
    = check('range(10, 0, 0-3)', [10,7,4,1]);
module.exports.rangeEmpty = check('range(1,0)', []);

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

module.exports.arrayMapProperties
    = check('[{foo:1},{foo:2}].map(foo*2)', [2,4]);

module.exports.arrayMapExplicitVar
    = check('[1,2,3].map(x,x*2)', [2,4,6]);

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

module.exports.arrayWhereProperties
    = check('[{foo:5},{foo:15}].where(10 < foo)', [{foo:15}]);

module.exports.arrayWhereExplicitVar
    = check('[1,20,2,30,3,15].where(x,10<x)', [20,30,15]);

// comprehensions

module.exports.compLazy
    = check('var total = 0; function see(n) { total += n; }; [see(_) for [1,2,3]]; total', 0);

module.exports.compForced
    = check('var total = 0; function see(n) { total += n; }; [see(_) for [1,2,3]] [1]; total', 3);

module.exports.compNoopAnonymous
    = check('[_ for [1,2,3]]', [1,2,3]);

module.exports.compNoopExplicit
    = check('[x for x in [1,2,3]]', [1,2,3]);

module.exports.compAnonMap
    = check('[_ + 1 for range(1,5)]', [2,3,4,5,6]);

module.exports.compNested
    = check('[[x, y] for x in [0,1]; y in [0,1]]',
            [[0,0], [0,1], [1,0], [1,1]]);

module.exports.compIf
    = check('[x for x in range(0, 5) if x < 3]', [0,1,2]);

module.exports.compNestedDependent
    = check('[x + y for x in range(0,3); y in range(0, x)]',
            [0,1,2,2,3,4,3,4,5,6]);

module.exports.compNestedIf
    = check('[x + y for x in range(0,3); y in range(0, 3) if y < x]',
            [1,2,3,3,4,5]);

module.exports.compIntermediateIf
    = check('[x + y for x in range(0, 3) if 1 < x; y in range(0, x)]',
            [2,3,4,3,4,5,6]);

module.exports.compField
    = check('[foo for [{foo: 1}, {foo: 2}]]', [1,2]);

module.exports.compObjectShortcut
    = check('[{foo} for [{foo: 1, bar: 2}, {foo: 2, bar: 3}]]',
            [{foo: 1}, {foo: 2}]);

// string interpolation

module.exports.stringLiteral
    = check("'{Literal}'", '{Literal}');

module.exports.stringInterpolateTrivial
    = check('"Literal"', 'Literal');

module.exports.stringInterpolateExpression
    = check('"{1 + 2}"', "3");

module.exports.stringInterpolateVar
    = check('var n = 4; "{n}"', "4");

module.exports.stringInterpolateParts
    = check('var n = 2; "foo-{n}-bar"', 'foo-2-bar');

module.exports.stringInterpolateEscapesInLiteral
    = check('"\\"\\{foo-{1 + 2}-bar\\}\\""', '"{foo-3-bar}"');

module.exports.stringInterpolateEscapesInExpr
    = check('"foo-{(\\{foo: \\"baz\\"\\}).foo}-bar"', 'foo-baz-bar');

// lazy values cannot depend on themselves ..

module.exports.blackholeIsIllegal
    = checkError('var a = lazy(a + 1); a + 1');

// .. unless there is something guarding the recursion, in this case
// the lazy sequence

module.exports.guardedLazyValue
    = check('var ones = lazy([[1], ones].concat()); ones[10]', 1);
