'use strict';

var parser = require('./javascript');
var fs = require('fs');


function Environment(parent) {
    this.frame = {};
    this.parent = parent;
}

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
            return tramp(cont, undefined);
        }
    });
};

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
            return tramp(cont, {
                get: function (cont, econt) {
                    return tramp(cont, base[node.name]);
                },
                set: function (val, cont, econt) {
                    base[node.name] = val;
                    return tramp(cont, undefined);
                }
            });
        });
    },
};

Environment.prototype.evaluateLValue = function (node, cont, econt) {
    var handler = evaluate_lvalue_type[node.type];
    if (handler)
        return handler(node, this, cont, econt);
    else
        return econt(new Error(node.type + " not an lvalue"));
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

// Decorate a strict function, taking args, cont, econt
function strict(fun) {
    return function (args, env, cont, econt) {
        return env.evaluateArgs(args, function (evaled_args) {
            return fun(evaled_args, cont, econt);
        }, econt);
    };
}

// Invoke a function with argument values
function invoke(fun, args, cont, econt) {
    return fun.call(null, args.map(function (arg) {
        return { type: 'Literal', value: arg };
    }), new Environment(null), cont, econt);
}

function Lazy(node, env) {
    this.node = node;
    this.env = env;
}

Lazy.prototype.force = function (cont, econt) {
    if ('value' in this) {
        return tramp(cont, this.value);
    }
    else if ('error' in this) {
        return tramp(cont, this.error);
    }
    else {
        var lazy = this;
        return this.env.evaluateForced(this.node, function (v) {
            lazy.env = lazy.node = null;
            lazy.value = v;
            return tramp(cont, v);
        }, function (e) {
            lazy.env = lazy.node = null;
            lazy.error = e;
            return tramp(econt, e);
        });
    }
};

function force(val, cont, econt) {
    if (val instanceof Lazy)
        return val.force(cont, econt);
    else
        return tramp(cont, val);
}

var binary_ops = {
    '+': function (a, b) { return a + b; },
    '*': function (a, b) { return a * b; },
};

// binary_ops indexed by the corresponding assignment operator
var assignment_ops = {};
for (var op in binary_ops) {
    assignment_ops[op+'='] = binary_ops[op];
}

function literal(node, env, cont, econt) {
    return tramp(cont, node.value);
}

var evaluate_type = {
    Literal: literal,
    NumericLiteral: literal,
    StringLiteral: literal,

    EmptyStatement: function (node, env, cont, econt) {
        return tramp(cont, undefined);
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
                    return tramp(cont, binary_ops[node.operator](a, b));
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
                    return tramp(cont, undefined);

                var decl = decls[i];
                if (decl.value)
                    break;

                env.bind(decl.name, undefined);
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
        return env.evaluateForced(node.name, function (f) {
            return f.call(null, node.arguments, env, cont, econt);
        }, econt);
    },

    Function: function (node, env, cont, econt) {
        var fun = strict(function (args, cont2, econt2) {
            var subenv = new Environment(env);
            for (var i = 0; i < node.params.length; i++)
                subenv.bind(node.params[i], args[i]);

            return subenv.evaluateStatements(node.elements, cont2, econt2);
        });

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
            return env.evaluate(node.right, function (b) {
                if (node.operator === '=') {
                    return lval.set(b, function () {
                        return tramp(cont, b);
                    }, econt);
                }
                else {
                    return lval.get(function (a) {
                        var res = assignment_ops[node.operator](a, b);
                        return lval.set(res, function () {
                            return tramp(cont, res);
                        }, econt);
                    }, econt);
                }
            }, econt);
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
    var handler = evaluate_type[node.type];
    if (handler)
        return handler(node, this, cont, econt);
    else
        return econt(new Error(node.type + " not yet implemented"));
};

Environment.prototype.evaluateForced = function (node, cont, econt) {
    return this.evaluate(node, function (val) {
        return force(val, cont, econt);
    }, econt);
};

Environment.prototype.evaluateStatements = function (stmts, cont, econt) {
    var env = this;

    function do_elements(i, last) {
        if (i == stmts.length)
            return tramp(cont, last);

        return env.evaluate(stmts[i], function (last) {
            return do_elements(i + 1, last);
        }, econt);
    }

    return do_elements(0, undefined);
};

function tramp(cont, val) {
    return { cont: cont, val: val };
}

function oline(t) {
    while (t)
        t = t.cont(t.val);
}

Environment.prototype.run = function (p, cont, econt) {
    try {
        p = parser.parse(p);
        //console.log(JSON.stringify(p, null, "  "));
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

function lift_function(f) {
    return strict(function (args, cont, econt) {
        try {
            return tramp(cont, f.apply(null, args));
        }
        catch (e) {
            return tramp(econt, e);
        }
    });
}

function lift_promised_function(f) {
    return strict(function (args, cont, econt) {
        try {
            f.apply(null, args).then(function (val) {
                oline(cont(val));
            }, function (err) {
                oline(econt(err));
            });
        }
        catch (e) {
            return tramp(econt, e);
        }
    });
}

var builtins = new Environment();

builtins.bind('callcc', strict(function (args, cont, econt) {
    // Wrap the original continuation in a callable function
    var wrapped_cont = strict(function (args2, cont2, econt2) {
        // ... that takes a single argument and calls the original
        // continuation with it.
        return tramp(cont, args2[0]);
    });

    // Call the provided continuation recipient with a single argument...
    return invoke(args[0], [wrapped_cont], cont, econt);
}));

builtins.bind('lazy', function (args, env, cont, econt) {
    return tramp(cont, new Lazy(args[0], env));
});

function run(p) {
    builtins.run(p,
                 function (val) { console.log("=> " + val); },
                 function (err) { console.log("=! " + err); });
}

//builtins.bind('print', lift_function(function (x) { console.log(x); }));
//run("try { (function (n) { var x = n+1; print(x); throw 'bang'; 42; })(69); } catch (e) { print('oops: ' + e); 69; }");
//run("var x; callcc(function (c) { x = c; }); print('Hello'); x();");
//run("print(1+42)");
//var code = "var x; callcc(function (c) { x = c; }); print('Hello'); x();"
//var code = "print(a+42)";
//run("function intsFrom(n) { lazy({head: n, tail: intsFrom(n+1)}); } intsFrom(0).tail.tail.tail.head;");

module.exports.builtins = builtins;
module.exports.Environment = Environment;
module.exports.lift_function = lift_function;
module.exports.lift_promised_function = lift_promised_function;