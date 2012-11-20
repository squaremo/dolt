'use strict';

var parser = require('./javascript');
var util = require('util');

// Basic interpreter machinery

function tramp(cont, val) {
    return { cont: cont, val: val };
}

function oline(t) {
    while (t)
        t = t.cont(t.val);
}


// Representation of types:
//
// For compactness, values in the interpreter are often represented as
// native JS values (both primitives and objects).  But it is tricky
// to operate directly on those values, without exposing their JS
// behaviour in an uncontrolled fashion.
//
// Hance IValues, which 'lift' the base values into a convenient
// representation.

function IValue() {}

IValue.prototype.truthy = function () {
    return true;
};

IValue.prototype.toNumber = function () {
    throw new Error(this.typename + ' is not a number');
};

var binary_operators = ['+', '-', '*'];
binary_operators.forEach(function (op) {
    IValue.prototype[op] = function (other) {
        throw new Error(this.typename + ' is not a number');
    };
});

IValue.prototype.force = function (cont, econt) {
    return tramp(cont, this);
};

IValue.prototype.invoke = function (args, env, cont, econt) {
    return tramp(econt, new Error(this.typename + ' is not a function'));
};

IValue.prototype.property = function (key, cont, econt) {
    return tramp(econt, new Error(this.typename + ' is not an object'));
};

function itype(name, constr) {
    constr = constr || function () {};
    util.inherits(constr, IValue);
    constr.prototype.typename = name;
    constr.prototype.methods = {};
    return constr;
}

function singleton_itype(name, props) {
    var constr = itype(name);
    var singleton = new constr();
    for (var p in props)
        singleton[p] = props[p];
    return singleton;
}


// undefined

var iundefined = singleton_itype('undefined', {
    truthy: function () { return false; },
    toString: function () { return 'undefined'; }
});


// numbers

var INumber = itype('number', function (value) {
    this.value = value;
});

INumber.prototype.truthy = function () {
    return this.value != 0;
};

INumber.prototype.toNumber = function () {
    return this.value;
};

INumber.prototype.toString = function () {
    return String(this.value);
};

INumber.prototype['+'] = function(other) {
    return this.value + other.toNumber();
};

INumber.prototype['-'] = function(other) {
    return this.value - other.toNumber();
};

INumber.prototype['*'] = function(other) {
    return this.value * other.toNumber();
};


// strings

var IString = itype('string', function (value) {
    this.value = value;
});

IString.prototype.truthy = function () {
    return this.value.length != 0;
};

IString.prototype.toString = function () {
    return this.value;
};

IString.prototype['+'] = function(other) {
    return this.value + other.toString();
};


// How to convert JS values to IValues
var js_type_to_ivalue = {
    undefined: function (val, cont, econt) {
        return tramp(cont, iundefined);
    },

    number: function (val, cont, econt) {
        return tramp(cont, new INumber(val));
    },

    string: function (val, cont, econt) {
        return tramp(cont, new IString(val));
    },

    object: function (val, cont, econt) {
        if (val instanceof IValue)
            return val.force(cont, econt);
        else
            return tramp(cont, new IObject(val));
    },
};

function force(val, cont, econt) {
    var handler = js_type_to_ivalue[typeof(val)];
    if (handler)
        return handler(val, cont, econt);
    else
        return tramp(econt, new Error("mysterious value " + val));
}

// Invoke an interpreter function with JS arguments
function invoke(fun, args, cont, econt) {
    return force(fun, function (fun) {
        return fun.invoke(args.map(function (arg) {
            return { type: 'Literal', value: arg };
        }), new Environment(null), cont, econt);
    }, econt);
}

// User-defined functions

var IUserFunction = itype('function', function (node, env) {
    this.node = node;
    this.env = env;
});

IUserFunction.prototype.toString = function () {
    return '[Function]';
};

IUserFunction.prototype.invoke = function (args, env, cont, econt) {
    var fun = this;
    return env.evaluateArgs(args, function (evaled_args) {
        var subenv = new Environment(fun.env);
        var params = fun.node.params;
        for (var i = 0; i < params.length; i++)
            subenv.bind(params[i], evaled_args[i]);

        return subenv.evaluateStatements(fun.node.elements, cont, econt);
    }, econt);
};


// Built-in functions

var IBuiltinFunction = itype('built-in function');

IBuiltinFunction.prototype.toString = function () {
    return '[Built-in Function]';
};

// The most general form of builtin.  Gets its arguments unevaluated,
// and the continuations.
function deferred_builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = fun;
    return res;
}

// A builtin that gets its arguments evaluated, but also recieves the
// continuations.
function strict_builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = function (args, env, cont, econt) {
        return env.evaluateArgs(args, function (evaled_args) {
            return fun(evaled_args, cont, econt);
        }, econt);
    };
    return res;
}

// The simplest form of builtin: Gets its arguments evaluated, and
// returns a simple result.
function builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = function (args, env, cont, econt) {
        return env.evaluateArgs(args, function (evaled_args) {
            try {
                return tramp(cont, fun.apply(null, evaled_args));
            }
            catch (e) {
                return tramp(econt, e);
            }
        }, econt);
    };
    return res;
}

// A builtin the gets its arguments evaluated, and returns a promise
// which allows it to block the interpreter.
function promised_builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = function (args, env, cont, econt) {
        return env.evaluateArgs(args, function (evaled_args) {
            try {
                fun.apply(null, evaled_args).then(function (val) {
                    oline(cont(val));
                }, function (err) {
                    oline(econt(err));
                });
            }
            catch (e) {
                return tramp(econt, e);
            }
        }, econt);
    };
    return res;
}


// Objects

var IObject = itype('object', function (obj) {
    this.obj = obj;
});

IObject.prototype.toString = function () {
    return util.inspect(this.obj);
};

IObject.prototype.property = function (key, cont, econt) {
    var obj = this.obj;
    return tramp(cont, {
        get: function (cont, econt) {
            // Avoid the prototype chain
            return tramp(cont, obj.hasOwnProperty(key) ? obj[key] : iundefined);
        },
        set: function (val, cont, econt) {
            obj[key] = val;
            return tramp(cont);
        }
    });
};


// Lazies

var ILazy = itype('lazy', function (node, env) {
    this.node = node;
    this.env = env;
});

ILazy.prototype.toString = function () {
    if ('value' in this)
        return 'lazy(forced: ' + this.value + ')';
    else if ('error' in this)
        return 'lazy(error: ' + this.value + ')';
    else
        return 'lazy(unforced)';
};

ILazy.prototype.force = function (cont, econt) {
    if ('value' in this) {
        return tramp(cont, this.value);
    }
    else if ('error' in this) {
        return tramp(econt, this.error);
    }
    else {
        var lazy = this;
        return this.env.evaluateForced(this.node, function (v) {
            lazy.env = lazy.node = null;
            lazy.value = v;
            return tramp(cont, v);
        }, function foo(e) {
            lazy.env = lazy.node = null;
            lazy.error = e;
            return tramp(econt, e);
        });
    }
}

//Lazy.prototype.methods.forced = function (args, env, cont, econt) {
//    return tramp(cont, 'value' in this || 'error' in this);
//};


// Environments

function Environment(parent, frame) {
    this.frame = (frame || {});
    this.parent = parent;
}

Environment.prototype.run = function (p, cont, econt, dump_parse) {
    try {
        p = parser.parse(p);
        if (dump_parse)
            console.log(JSON.stringify(p, null, "  "));
    }
    catch (e) {
        econt(e);
        return;
    }

    oline(this.evaluate(p, function (val) {
        cont(val);
    }, function (err) {
        econt(err);
    }));
};

Environment.prototype.bind = function (symbol, val) {
    this.frame[symbol] = val;
};

Environment.prototype.variable = function (symbol, cont, econt) {
    var env = this;
    while (!(symbol in env.frame)) {
        env = env.parent;
        if (!env)
            return tramp(econt, new Error("unbound variable '" + symbol + "'"));
    }

    return tramp(cont, {
        get: function (cont, econt) {
            return tramp(cont, env.frame[symbol]);
        },
        set: function (val, cont, econt) {
            env.frame[symbol] = val;
            return tramp(cont);
        }
    });
};

Environment.prototype.evaluateForced = function (node, cont, econt) {
    return this.evaluate(node, function (val) {
        return force(val, cont, econt);
    }, econt);
};

Environment.prototype.evaluateArgs = function (nodes, cont, econt) {
    var env = this;
    var evaled = [];

    function do_args(i) {
        if (i == nodes.length)
            return tramp(cont, evaled);

        return env.evaluate(nodes[i], function (a) {
            evaled.push(a);
            return do_args(i + 1);
        }, econt);
    }

    return do_args(0);
}

Environment.prototype.evaluateStatements = function (stmts, cont, econt) {
    var env = this;

    function do_elements(i, last) {
        if (i == stmts.length)
            return tramp(cont, last);

        return env.evaluate(stmts[i], function (last) {
            return do_elements(i + 1, last);
        }, econt);
    }

    return do_elements(0, iundefined);
};


// LValue support
//
// An lvalue is represented as an object of the form:
//
// {
//   get: function (cont, econt) { ... }, // yields value in the lvalue
//   set: function (val, cont, econt) { ... }, // yields nothing
// }

var evaluate_lvalue_type = {
    Variable: function (node, env, cont, econt) {
        return env.variable(node.name, cont, econt);
    },

    PropertyAccess: function (node, env, cont, econt) {
        return env.evaluateForced(node.base, function (base) {
            return base.property(node.name, cont, econt);
        }, econt);
    },
};

Environment.prototype.evaluateLValue = function (node, cont, econt) {
    // Verify that econt is always supplied, it's easy to overlook
    if (!econt)
        throw Error("missing econt");

    var handler = evaluate_lvalue_type[node.type];
    if (handler)
        return handler(node, this, cont, econt);
    else
        return econt(new Error(node.type + " not an lvalue"));
};

// to convert from assignment operators to the corresponding binary operators
var assignment_to_binary_op = {};
binary_operators.forEach(function (op) {
    assignment_to_binary_op[op+'='] = op;
});

function literal(node, env, cont, econt) {
    return tramp(cont, node.value);
}

var evaluate_type = {
    Literal: literal,
    NumericLiteral: literal,
    StringLiteral: literal,

    EmptyStatement: function (node, env, cont, econt) {
        return tramp(cont, iundefined);
    },

    Program: function (node, env, cont, econt) {
        return env.evaluateStatements(node.elements, cont, econt);
    },

    Block: function (node, env, cont, econt) {
        return env.evaluateStatements(node.statements, cont, econt);
    },

    BinaryExpression: function (node, env, cont, econt) {
        return env.evaluateForced(node.left, function (a) {
            return env.evaluateForced(node.right, function (b) {
                try {
                    return tramp(cont, a[node.operator](b));
                }
                catch (e) {
                    return tramp(econt, e);
                }
            }, econt);
        }, econt);
    },

    VariableStatement: function (node, env, cont, econt) {
        var decls = node.declarations;

        function do_decls(i) {
            for (;;) {
                if (i == decls.length)
                    return tramp(cont, iundefined);

                var decl = decls[i];
                if (decl.value)
                    break;

                env.bind(decl.name, iundefined);
                i++;
            }

            return env.evaluate(decl.value, function (val) {
                env.bind(decl.name, val);
                return do_decls(i + 1);
            }, econt);
        }

        return do_decls(0);
    },

    FunctionCall: function (node, env, cont, econt) {
        if (node.name.type == 'PropertyAccess') {
            // It might be a method call
            return env.evaluateForced(node.name.base, function (base) {
                return base.invokeMethod(node.arguments, env, cont, econt);
            }, econt);
        }
        else {
            return env.evaluateForced(node.name, function (fun) {
                return fun.invoke(node.arguments, env, cont, econt);
            }, econt);
        }
    },

    Function: function (node, env, cont, econt) {
        var fun = new IUserFunction(node, env);
        if (node.name)
            env.bind(node.name, fun);

        return tramp(cont, fun);
    },

    TryStatement: function (node, env, cont, econt) {
        return env.evaluateStatements(node.block.statements, cont, function (err) {
            var katch = node['catch'];
            var subenv = new Environment(env);
            subenv.bind(katch.identifier, err);
            return subenv.evaluateStatements(katch.block.statements, cont, econt);
        });
    },

    ThrowStatement: function (node, env, cont, econt) {
        return env.evaluateForced(node.exception, econt, econt);
    },

    AssignmentExpression: function (node, env, cont, econt) {
        return env.evaluateLValue(node.left, function (lval) {
            if (node.operator === '=') {
                return env.evaluate(node.right, function (val) {
                    return lval.set(val, function () {
                        return tramp(cont, val);
                    }, econt);
                });
            }
            else {
                // Force the left side before we evaluate the right side.
                return lval.get(function (a) {
                    return force(a, function (a) {
                        return env.evaluateForced(node.right, function (b) {
                            try {
                                var res = a[assignment_to_binary_op[node.operator]](b);
                                return lval.set(res, function () {
                                    return tramp(cont, res);
                                }, econt);
                            }
                            catch (e) {
                                return tramp(econt, e);
                            }
                        }, econt);
                    }, econt);
                }, econt);
            }
        }, econt);
    },

    ObjectLiteral: function (node, env, cont, econt) {
        var props = node.properties;
        var res = {};

        function do_props(i) {
            if (i == props.length)
                return tramp(cont, res);

            return env.evaluate(props[i].value, function (val) {
                res[props[i].name] = val;
                return do_props(i + 1);
            }, econt);
        }

        return do_props(0);
    },

    ArrayLiteral: function (node, env, cont, econt) {
        var elems = node.elements;
        var res = [];

        function do_elems(i) {
            if (i == elems.length)
                return tramp(cont, res);

            return env.evaluate(elems[i], function (val) {
                res.push(val);
                return do_elems(i + 1);
            }, econt);
        }

        return do_elems(0);
    },
};

function lvalue_handler_to_rvalue_handler(lvalue_handler) {
    return function (node, env, cont, econt) {
        return lvalue_handler(node, env, function (lval) {
            return lval.get(cont, econt);
        }, econt);
    };
}

// Convert all lvalue handlers to rvalue handlers
for (var t in evaluate_lvalue_type) {
    evaluate_type[t] = lvalue_handler_to_rvalue_handler(evaluate_lvalue_type[t]);
}

Environment.prototype.evaluate = function (node, cont, econt) {
    // Verify that econt is always supplied, it's easy to overlook
    if (!econt)
        throw Error("missing econt");

    var handler = evaluate_type[node.type];
    if (handler)
        return handler(node, this, cont, econt);
    else
        return econt(new Error(node.type + " not yet implemented"));
};

// Builtins

var builtins = new Environment();

builtins.bind('callcc', strict_builtin(function (args, cont, econt) {
    // Wrap the original continuation in a callable function
    var wrapped_cont = strict_builtin(function (args2, cont2, econt2) {
        // ... that takes a single argument and calls the original
        // continuation with it.
        return tramp(cont, args2[0]);
    });

    // Call the provided continuation recipient with a single argument...
    return invoke(args[0], [wrapped_cont], cont, econt);
}));

builtins.bind('lazy', deferred_builtin(function (args, env, cont, econt) {
    return tramp(cont, new ILazy(args[0], env));
}));

builtins.bind('map', deferred_builtin(function (args, env, cont, econt) {
    return env.evaluate(args[0], function (arr) {
        var res = [];

        function do_elems(i) {
            if (i == arr.length)
                return tramp(cont, res);

            var elem = arr[i];
            var subenv = env;

            // If the element is an object, turn it into a frame in
            // the environment
            if (typeof(elem) === 'object')
                subenv = new Environment(subenv, elem);

            // And bind the element as '_'
            subenv = new Environment(subenv);
            subenv.bind('_', elem);

            return subenv.evaluate(args[1], function (mapped) {
                res.push(mapped);
                return do_elems(i + 1);
            }, econt);
        }

        return do_elems(0);
    }, econt);
}));

builtins.bind('filter', deferred_builtin(function (args, env, cont, econt) {
    return env.evaluate(args[0], function (arr) {
        var res = [];

        function do_elems(i) {
            if (i == arr.length)
                return tramp(cont, res);

            var elem = arr[i];
            var subenv = env;

            // If the element is an object, turn it into a frame in
            // the environment
            if (typeof(elem) === 'object')
                subenv = new Environment(subenv, elem);

            // And bind the element as '_'
            subenv = new Environment(subenv);
            subenv.bind('_', elem);

            return subenv.evaluate(args[1], function (pred) {
                if (pred)
                    res.push(elem);

                return do_elems(i + 1);
            }, econt);
        }

        return do_elems(0);
    }, econt);
}));

function run(p) {
    builtins.run(p,
                 function (val) { console.log("=> " + val); },
                 function (err) { console.log("=! " + err); },
                 true);
}

//builtins.bind('print', builtin(function (x) { console.log(x); }));
//run("print(1+42)");
//run("function foo(x) { print(x+1); } foo(42);");
//run("print(callcc(function (c) { c('Hello'); }))");
//run("var x; callcc(function (c) { x = c; }); print('Hello'); x();");
//run("function intsFrom(n) { lazy({head: n, tail: intsFrom(n+1)}); } intsFrom(0).tail.tail.tail.head;");
//run("map([1,2,3], _*2)");
//run("try { (function (n) { var x = n+1; print(x); throw 'bang'; 42; })(69); } catch (e) { print('oops: ' + e); 69; }");

module.exports.builtins = builtins;
module.exports.Environment = Environment;
module.exports.builtin = builtin;
module.exports.promised_builtin = promised_builtin;