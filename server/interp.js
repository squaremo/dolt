'use strict';

var parser = require('./javascript');
var util = require('util');

// Basic interpreter machinery

var counter = 0;

function tramp(cont, val) {
    return { cont: cont, val: val, counter: ++counter };
}

function oline(t) {
    while (t) {
        if (t.counter != counter) {
            console.error("OOPS! " + t.counter + " " + counter);
            console.error("Tramp: " + t);
            console.error("Continuation: " + t.cont);
            console.error("Value: " + t.val);
        }

        t = t.cont(t.val);
    }
}

// Takes a non-CPS function (one that simply returns its result), and
// wraps it to take the cont and econt parameters.
function continuate(fun) {
    return function (/* ... cont, econt */) {
        var args = Array.prototype.slice.call(arguments, 0,
                                              arguments.length - 2);
        try {
            return tramp(arguments[arguments.length - 2],
                         fun.apply(this, args));
        }
        catch (e) {
            return tramp(arguments[arguments.length - 1], e);
        }
    };
}

// A sane hasOwnProperty
function hasOwnProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
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

IValue.prototype.truthy = continuate(function () { return true; });

IValue.prototype.toNumber = function () {
    throw new Error(this.typename + ' is not a number');
};

IValue.prototype.toJSValue = function () {
    return this;
};

var binary_operators = ['+', '-', '*', '<'];
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

IValue.prototype.getProperty = function (key, cont, econt) {
    return tramp(econt, new Error(this.typename + ' is not an object'));
};

IValue.prototype.setProperty = function (key, val, cont, econt) {
    return tramp(econt, new Error(this.typename + ' is not an object'));
};

// In general, use this rather than calling im_ methods directly,
// because it handles missing methods gracefully.
IValue.prototype.invokeMethod = function (name, args, env, cont, econt) {
    // If there is a method, call it
    var m = this['im_' + name];
    if (m)
        return m.call(this, args, env, cont, econt);
    else
        return tramp(econt, new Error(this.typename
                                      + ' has no method "' + name + '"'));
};

IValue.prototype.renderJSON = function (cont, econt) {
    return tramp(cont, this.toJSValue());
};

function itype(name, parent, constr) {
    constr = constr || function () {};
    util.inherits(constr, parent);
    constr.prototype.typename = name;
    return constr;
}

function singleton_itype(name, props) {
    var singleton = new IValue();
    singleton.typename = name;
    for (var p in props)
        singleton[p] = props[p];
    return singleton;
}


// undefined

var iundefined = singleton_itype('undefined', {
    truthy: continuate(function () { return false; }),
    toString: function () { return 'undefined'; },
    toJSValue: function () { return undefined; },
    renderJSON: continuate(function () { return {'!': 'undefined'}; }),
});

// booleans

var IBoolean = itype('boolean', IValue, function (value) {
    this.value = value;
});

IBoolean.prototype.truthy = continuate(function() { return this.value; });
IBoolean.prototype.toString = function() {return String(this.value);};
IBoolean.prototype.toJSValue = function() { return this.value; };

// numbers

var INumber = itype('number', IValue, function (value) {
    this.value = value;
});

INumber.prototype.truthy = continuate(function () { return this.value != 0; });

INumber.prototype.toNumber = function () {
    return this.value;
};

INumber.prototype.toString = function () {
    return String(this.value);
};

INumber.prototype.toJSValue = function () {
    return this.value;
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

INumber.prototype['<'] = function(other) {
    return this.value < other.toNumber();
};

// strings

var IString = itype('string', IValue, function (value) {
    this.value = value;
});

IString.prototype.truthy = continuate(function () {
    return this.value.length != 0;
});

IString.prototype.toString = function () {
    return this.value;
};

IString.prototype.toJSValue = function () {
    return this.value;
};

IString.prototype['+'] = function(other) {
    return this.value + other.toString();
};


// How to convert JS values to IValues
var js_type_to_ivalue = {
    undefined: function (val) { return iundefined; },
    number: function (val) { return new INumber(val); },
    boolean: function (val) { return new IBoolean(val); },
    string: function (val) { return new IString(val); },
    object: function (val) {
        if (val instanceof IValue)
            return val;
        else if (val instanceof Array)
            return new IArray(val);
        else
            return new IObject(val);
    },
};

// Convert a value, that may be a JS value or already an IValue, to
// the corresponding IValue.
IValue.from_js = function (jsval) {
    var convert = js_type_to_ivalue[typeof(jsval)];
    if (convert)
        return convert(jsval);
    else
        throw new Error("mysterious value " + jsval);
};

// Convert to an IValue then force it.  This is usually what you want,
// not IValue.from_js, because if you want to get an IValue, your
// probably about to do something with it that is conceptually
// 'forcing'.
function force(val, cont, econt) {
    // Verify that econt is always supplied, it's easy to overlook
    if (!econt)
        throw Error("missing econt");

    try {
        return IValue.from_js(val).force(cont, econt);
    }
    catch (e) {
        return tramp(econt, e);
    }
}

// Convert a value, that may be an IValue or already a JS value, to
// the corresponding JS value.
IValue.to_js = function (val) {
    if (val instanceof IValue)
        return val.toJSValue();
    else
        return val;
};

// Encode a value to the JSON data to be sent to the client
//
// The encoding for IValues corresponding to JS types is mostly
// straightforward.  Types that the client should present specially
// are encoded as JSON objects with a '!' property indicating the
// type.  Because of this, we need to encode IObject property names
// that might clash.  This is done by adding an extra '!' char to an
// property name consisting of only '!' chars.
IValue.renderJSON = function (val, cont, econt) {
    return IValue.from_js(val).renderJSON(cont, econt);
};

// Decode the JSON representation of a value back into the
// corresponding JS value / IValue.
IValue.decodeJSON = function (json) {
    if (typeof(json) !== 'object')
        return json;

    if (json instanceof Array)
        return new IArray.decodeJSON(json);

    var type = json['!'];
    if (type === undefined)
        return new IObject.decodeJSON(json);
    else
        return json_decoder[type](json);
}

var json_decoder = {};

// Invoke an interpreter function with JS arguments
function invoke(fun, args, cont, econt) {
    return force(fun, function (fun) {
        return fun.invoke(args.map(function (arg) {
            return { type: 'Literal', value: arg };
        }), new Environment(null), cont, econt);
    }, econt);
}

// User-defined functions

var IUserFunction = itype('function', IValue, function (node, env) {
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

var IBuiltinFunction = itype('built-in function', IValue);

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

// A builtin that gets its arguments evaluated, but also receives the
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

var IObject = itype('object', IValue, function (obj) {
    this.obj = obj;
});

IObject.prototype.truthy = continuate(function () {
    for (var p in this.obj) {
        if (hasOwnProperty(this.obj, p))
            return true;
    }

    return false;
});

IObject.prototype.toString = function () {
    return util.inspect(this.obj);
};

IObject.prototype.toJSValue = function () {
    return this.obj;
};

IObject.prototype.getProperty = function (key, cont, econt) {
    key = IValue.to_js(key);
    // Avoid the prototype chain
    return tramp(cont, hasOwnProperty(this.obj, key) ? this.obj[key]
                                                     : iundefined);
};

IObject.prototype.setProperty = function (key, val, cont, econt) {
    this.obj[IValue.to_js(key)] = val;
    return tramp(cont);
};

IObject.prototype.invokeMethod = function (name, args, env, cont, econt) {
    // Try methods first
    var m = this['im_'+name];
    if (m)
        return m.call(this, args, env, cont, econt);

    // Otherwise interpret method invocations as property accesses
    var prop = hasOwnProperty(this.obj, name) ? this.obj[name] : iundefined;
    return force(prop, function (val) {
        return val.invoke(args, env, cont, econt);
    }, econt);
};

IObject.encoded_property_name_re = /^!+$/;

IObject.prototype.renderJSON = function (cont, econt) {
    var obj = this.obj;
    var res = {};
    var props = [];

    // First we need to collect the property keys so that we can
    // iterate over them below
    for (var p in obj)
        if (hasOwnProperty(obj, p))
            props.push(p);

    function do_props(i) {
        if (i == props.length)
            return tramp(cont, res);

        return IValue.renderJSON(obj[props[i]], function (json) {
            var enc_prop = props[i];
            if (IObject.encoded_property_name_re.test(enc_prop))
                enc_prop = '!' + enc_prop;

            res[enc_prop] = json;
            return do_props(i + 1);
        }, econt);
    }

    return do_props(0);
};

IObject.decodeJSON = function (json) {
    var encoded = null;

    for (var p in json) {
        json[p] = IValue.decodeJSON(json[p]);
        if (IObject.encoded_property_name_re.test(p)) {
            encoded = encoded || {};
            encoded[p.substring(1)] = json[p];
            delete json[p];
        }
    }

    if (encoded)
        for (var p in encoded)
            json[p] = encoded[p];

    return new IObject(json);
};

// Lazies

var ILazy = itype('lazy', IValue, function (producer) {
    this.producer = producer;
});

// Declare some forcing methods (i.e. methods that force the ILazy and
// then call the same method on the resulting object) on ILazy or a
// subclass.
ILazy.forcingMethods = function (constr /* , names ... */) {
    function forcingMethod(name) {
        constr.prototype[name] = function (/* ..., cont, econt */) {
            var args = arguments;
            return this.force(function (val) {
                return val[name].apply(val, args);
            }, args[args.length - 1]);
        };
    }

    for (var i = 1; i < arguments.length; i++)
        forcingMethod(arguments[i]);
};

// Declare some lazy methods (i.e. methods that yield an ILazy that
// when forced, force the underlying object in turn and invoke the
// method on it).
ILazy.lazyMethods = function (constr /* , names ... */) {
    function lazyMethod(name) {
        constr.prototype[name] = continuate(function (/* ... */) {
            var orig_lazy = this;
            var args = Array.prototype.slice.call(arguments);
            return new constr(function (cont, econt) {
                return orig_lazy.force(function (val) {
                    args.push(cont, econt);
                    return val[name].apply(val, args);
                });
            });
        });
    }

    for (var i = 1; i < arguments.length; i++)
        lazyMethod(arguments[i]);
}

ILazy.forcingMethods(ILazy, 'truthy', 'renderJSON');

ILazy.prototype.toString = function () {
    if (this.producer)
        return this.typename + '(unforced)';
    else if ('value' in this)
        return this.typename + '(forced: ' + self.value + ')';
    else if ('error' in this)
        return this.typename + '(error: ' + self.error + ')';
    else
        return this.typename + '(forcing)';
};

ILazy.prototype.force = function (cont, econt) {
    this.force = ILazy.forcing;
    var self = this;

    function on_value(val) {
        self.force = ILazy.forced;
        self.producer = null;
        self.value = val;

        if (self.conts) {
            while (self.conts) {
                oline(cont(val));
                cont = self.conts.pop();
            }

            self.conts = null;
            self.econts = null;
        }

        return tramp(cont, val);
    }

    function on_error(err) {
        self.force = ILazy.error;
        self.producer = null;
        self.error = err;

        if (self.econts) {
            while (self.econts) {
                oline(econt(err));
                econt = self.econts.pop();
            }

            self.conts = null;
            self.econts = null;
        }

        return tramp(econt, err);
    }

    return this.producer(function (val) {
        return force(val, on_value, on_error);
    }, on_error);
};

ILazy.forcing = function (cont, econt) {
    if (!this.conts) {
        this.conts = [];
        this.econts = [];
    }

    this.conts.push(cont);
    this.econts.push(econt);
};

ILazy.forced = function (cont, econt) {
    return tramp(cont, this.value);
};

ILazy.error = function (cont, econt) {
    return tramp(econt, this.error);
};

// Sequences

var ILazySeq = itype('lazy sequence', ILazy, function (producer) {
    this.producer = producer;
});

ILazy.forcingMethods(ILazySeq, 'getProperty', 'addToArray');
ILazy.lazyMethods(ILazySeq, 'im_map', 'im_where', 'im_concat');

ILazySeq.range = function (from, to, step) {
    from = IValue.to_js(from);
    to = IValue.to_js(to);
    step = step && IValue.to_js(step) || 1;

    return new ILazySeq(continuate(function () {
        if (step * from > step * to)
            return inil;
        else
            return new ICons(from, ILazySeq.range(from + step, to, step));
    }));
};

var inil = singleton_itype('nil', {
    truthy: continuate(function () { return false; }),
    toString: function () { return '[]'; },
    getProperty: continuate(function (key) { return iundefined; }),
    addToArray: continuate(function (arr) {}),
    renderJSON: continuate(function() { return []; }),
    toSequence: function() { return this; },

    im_map: continuate(function (args, env) { return inil; }),
    im_concat: continuate(function(args, env) { return inil; }),
    im_where: continuate(function(args, env) { return inil; }),
    im_toArray: continuate(function (args, env) { return []; }),
});

var ICons = itype('cons', IValue, function (head, tail) {
    this.head = head;
    this.tail = tail;
});

ICons.prototype.toString = function () {
    return '[' + IValue.from_js(this.head) + ' | ' + this.tail + ']';
};

ICons.prototype.renderJSON = function (cont, econt) {
    return this.im_toArray([], null, function (arr) {
        return new IArray(arr).renderJSON(cont, econt);
    }, econt);
};

ICons.prototype.toSequence = function () {
    return this;
};

ICons.prototype.getProperty = function (key, cont, econt) {
    key = IValue.to_js(key);
    if (key === 0)
        return tramp(cont, this.head);
    else if (typeof(key) === 'number')
        return this.tail.getProperty(key - 1, cont, econt);
    else
        return tramp(cont, iundefined);
};

ICons.prototype.addToArray = function (arr, cont, econt) {
    arr.push(this.head);
    return this.tail.addToArray(arr, cont, econt);
};

ICons.prototype.im_toArray = function (args, env, cont, econt) {
    var res = [];
    return this.addToArray(res, function () { return tramp(cont, res); },
                           econt);
};

function apply_deferred_arg(defarg, env, elem, cont, econt) {
    var varname;
    var body;
    var subenv = env;

    switch (defarg.length) {
    case 1:
        varname = '_';
        body = defarg[0];

        // If the element is an object, turn it into a frame in the
        // environment
        if (typeof(elem) === 'object')
            subenv = new Environment(subenv, elem);

        break;

    case 2:
        if (defarg[0].type !== 'Variable')
            return tramp(econt, new Error('expected variable, got '
                                          + defarg[0].type));

        varname = defarg[0].name;
        body = defarg[1];
        break;

    case 3:
        return tramp(econt, new Error('deferred argument looks strange'));
    }

    subenv = new Environment(subenv);
    subenv.bind(varname, elem);
    return subenv.evaluate(body, cont, econt);
}

ICons.prototype.im_map = continuate(function (args, env) {
    var self = this;
    return new ILazySeq(function (cont, econt) {
        return apply_deferred_arg(args, env, self.head, function (head) {
            return self.tail.invokeMethod('map', args, env, function (tail) {
                return tramp(cont, new ICons(head, tail));
            }, econt);
        }, econt);
    });
});

ICons.prototype.im_where = continuate(function(args, env) {
    var self = this;
    return new ILazySeq(function (cont, econt) {
        return apply_deferred_arg(args, env, self.head, function (pass) {
            return IValue.from_js(pass).truthy(function (pass) {
                return self.tail.invokeMethod('where', args, env,
                                              function (next) {
                    if (pass)
                        next = new ICons(self.head, next);
                    return tramp(cont, next);
                }, econt);
            }, econt);
        }, econt);
    });
});

// flatten a sequence of sequences
//
// concat [] = []
// concat []:t = concat t
// concat [h:t1]:t2 = h:(concat [t1]:t2)
ICons.prototype.im_concat = continuate(function (args, env) {
    function concat(head, tail) {
        return new ILazySeq(function (cont, econt) {
            return force(head, function (head) {
                head = head.toSequence();
                if (head === inil)
                    return tail.invokeMethod('concat', args, env, cont, econt);

                return tramp(cont,
                             new ICons(head.head, concat(head.tail, tail)));
            }, econt);
        });
    }

    return concat(this.head, this.tail);
});


// Arrays

var IArray = itype('array', IObject, function (obj) {
    this.obj = obj;
});

IArray.prototype.toSequence = function () {
    var arr = this.obj;

    function sequence_from(i) {
        if (i == arr.length)
            return inil;
        else
            return new ICons(arr[i], sequence_from(i + 1));
    }

    return sequence_from(0);
};

IArray.prototype.im_map = function (args, env, cont, econt) {
    return this.toSequence().im_map(args, env, cont, econt);
};

IArray.prototype.im_where = function (args, env, cont, econt) {
    return this.toSequence().im_where(args, env, cont, econt);
};

IArray.prototype.im_concat = function (args, env, cont, econt) {
    return this.toSequence().im_concat(args, env, cont, econt);
};

IArray.prototype.im_toArray = continuate(function (args, env) {
    return this.obj;
});

IArray.prototype.renderJSON = function (cont, econt) {
    var arr = this.obj;
    var res = [];

    function do_elems(i) {
        if (i === arr.length)
            return tramp(cont, res);

        return IValue.renderJSON(arr[i], function (json) {
            res.push(json);
            return do_elems(i + 1);
        }, econt);
    }

    return do_elems(0);
};

IArray.decodeJSON = function (json) {
    return json.map(IValue.decodeJSON);
};


// A Table type

var ITable = itype('table', IValue, function (data, columns) {
    this.data = data;
    this.columns = columns;
});

ITable.prototype.getProperty = continuate(function (key) {
    if (hasOwnProperty(this, key))
        return this.key;
    else
        return iundefined;
});

ITable.prototype.renderJSON = function (cont, econt) {
    var self = this;
    return IValue.renderJSON(self.data, function (data) {
        return IValue.renderJSON(self.columns, function (columns) {
            return tramp(cont, {
                '!': 'table',
                data: data,
                columns: columns
            });
        });
    });
};

json_decoder.table = function (json) {
    return new ITable(IValue.decodeJSON(json.data),
                      IValue.decodeJSON(json.columns));
};


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

    oline(this.evaluate(p, cont, econt));
};

Environment.prototype.runForJSON = function (p, cont, econt, dump_parse) {
    this.run(p, function (res) {
        oline(IValue.renderJSON(res, function (json) {
            cont(res, json);
        }, econt));
    }, econt, dump_parse);
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

Environment.prototype.evaluatePropertyName = function (name, cont, econt) {
    if (typeof(name) === 'object')
        // it's a foo[bar] PropertyAccess
        return this.evaluateForced(name, cont, econt);
    else
        // it's a foo.bar PropertyAccess
        return tramp(cont, name);
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
            return env.evaluatePropertyName(node.name, function (name) {
                return tramp(cont, {
                    get: function (cont, econt) {
                        return base.getProperty(name, cont, econt);
                    },
                    set: function (val, cont, econt) {
                        return base.setProperty(name, val, cont, econt);
                    }
                });
            }, econt);
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

function evaluate_literal(node, env, cont, econt) {
    return tramp(cont, node.value);
}

function evaluate_comprehension(node, env, cont, econt) {
    var varnode = []
    if (node.name)
        varnode.push({ type: 'Variable', name: node.name });

    return env.evaluate(node.generate, function (seq) {
        // we don't want to force seq, but we do need to handle
        // the case where it is a JS array.
        seq = IValue.from_js(seq);

        function do_map(seq) {
            return seq.invokeMethod('map', varnode.concat(node.yield), env,
                                    cont, econt);
        }

        if (!node.guard)
            return do_map(seq);
        else
            return seq.invokeMethod('where', varnode.concat(node.guard), env,
                                    do_map, econt);
    }, econt);
}

var evaluate_type = {
    Literal: evaluate_literal,
    NumericLiteral: evaluate_literal,
    StringLiteral: evaluate_literal,

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

    StringPattern: function (node, env, cont, econt) {
        var elems = node.elements;
        var pieces = [];

        function do_piece(i) {
            if (i === elems.length)
                return tramp(cont, pieces.join(''));

            return env.evaluateForced(elems[i], function (piece) {
                pieces.push(String(piece));
                return do_piece(i + 1);
            }, econt);
        }

        return do_piece(0);
    },

    FunctionCall: function (node, env, cont, econt) {
        if (node.name.type == 'PropertyAccess') {
            // It might be a method call
            return env.evaluateForced(node.name.base, function (base) {
                return env.evaluatePropertyName(node.name.name, function (name) {
                    return base.invokeMethod(name, node.arguments, env,
                                             cont, econt);
                }, econt);
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
                }, econt);
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

    ComprehensionMapExpression: evaluate_comprehension,
    ComprehensionConcatMapExpression: function(node, env, cont, econt) {
        return evaluate_comprehension(node, env, function (res) {
            return res.invokeMethod('concat', [], env, cont, econt);
        }, econt);
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
builtins.bind('nil', inil);
builtins.bind('undefined', iundefined);
builtins.bind('range', builtin(ILazySeq.range));

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
    return tramp(cont, new ILazy(function (cont2, econt2) {
        return env.evaluateForced(args[0], cont2, econt2);
    }));
}));

builtins.bind('table', builtin(function (data, cols) {
    return new ITable(data, cols);
}));

function run(p) {
    builtins.run(p,
                 function (val) { console.log("=> " + IValue.from_js(val)); },
                 function (err) { console.log("=! " + err.stack); },
                 true);
}

//builtins.bind('print', builtin(function (x) { console.log(x); }));
//run("print(callcc(function (c) { c('Hello'); }))");
//run("var x; callcc(function (c) { x = c; }); print('Hello'); x();");

module.exports.IValue = IValue;
module.exports.Environment = Environment;
module.exports.builtins = builtins;
module.exports.builtin = builtin;
module.exports.promised_builtin = promised_builtin;
