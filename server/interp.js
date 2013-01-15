'use strict';

var parser = require('./parser');
var util = require('util');

// Basic interpreter machinery

function Context() {
    // The stack of continuations that are used when evaluation
    // proceeds normally.
    this.stack = [];

    // The stack of handlers that are used for aborting the normal
    // flow of control.  I.e. exceptions, returns, and one day breaks
    // and continues
    this.handlerStack = [];

    // The current state, which can be:
    // 'value': Have a value to be supplied to the topmost continuation
    // 'abort': Abort of type this.abortType pending
    // 'empty': Awaiting a value.
    // 'paused': The interpreter has been paused.
    this.state = 'paused';

    // The current value, to be passed to the continuation on the top
    // of the stack.
    this.value = null;

    // The type of abort currently pending
    this.abortType = null;
}

Context.prototype.succeed = function (val) {
    if (this.state !== 'empty')
        throw new Error('Context.succeed in state ' + this.state);

    this.state = 'value';
    this.value = val;
};

// Abort normal execution.  type is the abort type (e.g. 'exception',
// 'return').  val is the exception or return value.
Context.prototype.abort = function (type, val) {
    if (this.state !== 'empty')
        throw new Error('Context.abort in state ' + this.state);

    this.state = 'abort';
    this.abortType = type;
    this.value = val;
};

Context.prototype.fail = function (e) {
    this.abort('exception', e);
};

Context.prototype.pushCont = function (k, dont_check_state) {
    if (this.state !== 'empty')
        throw new Error('Context.pushCont in state ' + this.state);

    this.stack.push(k);
    return this;
};

// Push a handler onto the abort stack.  The handler function takes
// (type, val), where type is the abort type (e.g. 'exception',
// 'return'), and val is the exception or return value.
Context.prototype.pushHandler = function (f) {
    if (this.state !== 'empty')
        throw new Error('Context.pushHandler in state ' + this.state);

    this.handlerStack.push({fun: f, stackDepth: this.stack.length});

    // Push a normal continuation that will discard the abort handler
    var self = this;
    this.stack.push(function (val) {
        self.handlerStack.pop();
        return self.succeed(val);
    });

    return this;
};

Context.prototype.pause = function () {
    if (this.state !== 'empty')
        throw new Error('Context.pause in state ' + this.state);

    this.state = 'paused';
};

Context.prototype.run = function (start_fun) {
    if (this.state !== 'paused')
        throw new Error('Context.run in state ' + this.state);

    this.state = 'empty';
    start_fun();

    var val;

    for (;;) {
        while (this.state === 'value') {
            val = this.value;
            this.state = 'empty';
            this.value = null;
            this.stack.pop()(val);
        }

        if (this.state === 'abort') {
            // Process an abort
            var abort = this.abortType;
            val = this.value
            this.state = 'empty';
            this.value = null;

            // Try handlers until one does something
            do {
                var handler = this.handlerStack.pop();

                while (this.stack.length > handler.stackDepth)
                    this.stack.pop();

                handler.fun(abort, val);
            } while (this.state === 'empty');
        }
        else {
            // State is either paused or empty
            break;
        }
    }

    if (this.state !== 'paused')
        throw new Error('Continuation left context in state ' + this.state);
};

Context.prototype.resume = function (val) {
    var self = this;
    this.run(function () { self.succeed(val); });
};

Context.prototype.resumeFail = function (err) {
    var self = this;
    this.run(function () { self.fail(err); });
};

// Takes a non-CPS function (one that simply returns its result), and
// wraps it to take the cont and econt parameters.
function continuate(fun) {
    return function (/* ... ctx */) {
        var args = Array.prototype.slice.call(arguments, 0, -1);
        var ctx = arguments[arguments.length-1];
        try {
            ctx.succeed(fun.apply(this, args));
        }
        catch (e) {
            ctx.fail(e);
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

IValue.prototype.truthy = function () { return true; };

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

IValue.prototype.force = function (ctx) {
    ctx.succeed(this);
};

IValue.prototype.invoke = function (args, env, ctx) {
    ctx.fail(new Error(this.typename + ' is not a function'));
};

IValue.prototype.getProperty = function (key, ctx) {
    ctx.fail(new Error(this.typename + ' is not an object'));
};

IValue.prototype.setProperty = function (key, val, ctx) {
    ctx.fail(new Error(this.typename + ' is not an object'));
};

// In general, use this rather than calling im_ methods directly,
// because it handles missing methods gracefully.
IValue.prototype.invokeMethod = function (name, args, env, ctx) {
    // If there is a method, call it
    var m = this['im_' + name];
    if (m)
        m.call(this, args, env, ctx);
    else
        ctx.fail(new Error(this.typename + ' has no method "' + name + '"'));
};

IValue.prototype.renderJSON = function (callback) {
    return this.toJSValue();
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
    truthy: function () { return false; },
    toString: function () { return 'undefined'; },
    toJSValue: function () { return undefined; },
    renderJSON: function () { return {'!': 'undefined'}; },
});

var inull = singleton_itype('null', {
    truthy: function () { return false; },
    toString: function() { return 'null'; },
    toJSValue: function () { return null; },
    renderJSON: function () { return null; },
});

// booleans

var IBoolean = itype('boolean', IValue, function (value) {
    this.value = value;
});

IBoolean.prototype.truthy = function () { return this.value; };
IBoolean.prototype.toString = function () {return String(this.value);};
IBoolean.prototype.toJSValue = function () { return this.value; };

// numbers

var INumber = itype('number', IValue, function (value) {
    this.value = value;
});

INumber.prototype.truthy = function () { return this.value !== 0; };

INumber.prototype.toNumber = function () {
    return this.value;
};

INumber.prototype.toString = function () {
    return String(this.value);
};

INumber.prototype.toJSValue = function () {
    return this.value;
};

INumber.prototype['+'] = function (other) {
    return this.value + other.toNumber();
};

INumber.prototype['-'] = function (other) {
    return this.value - other.toNumber();
};

INumber.prototype['*'] = function (other) {
    return this.value * other.toNumber();
};

INumber.prototype['<'] = function (other) {
    return this.value < other.toNumber();
};

// strings

var IString = itype('string', IValue, function (value) {
    this.value = value;
});

IString.prototype.truthy = function () { return this.value.length !== 0; };

IString.prototype.toString = function () {
    return this.value;
};

IString.prototype.toJSValue = function () {
    return this.value;
};

IString.prototype['+'] = function (other) {
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
        else if (val === null)
            return inull;
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
function force(val, ctx) {
    try {
        IValue.from_js(val).force(ctx);
    }
    catch (e) {
        ctx.fail(e);
    }
}

function truthify(val, ctx) {
    force(val, ctx.pushCont(function (val) { ctx.succeed(val.truthy()); }));
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
//
// See ILazy.prototype.renderJSON for the purpose of the callback.
IValue.renderJSON = function (val, callback) {
    return IValue.from_js(val).renderJSON(callback);
};

// Decode the JSON representation of a value back into the
// corresponding JS value / IValue.
IValue.decodeJSON = function (json) {
    if (typeof(json) !== 'object' || json === null)
        return json;

    if (json instanceof Array)
        return IArray.decodeJSON(json);

    var type = json['!'];
    if (type === undefined)
        return IObject.decodeJSON(json);
    else
        return json_decoder[type](json);
};

var json_decoder = {};

json_decoder['undefined'] = function (_v) { return iundefined; };

// User-defined functions

var IUserFunction = itype('function', IValue, function (node, env) {
    this.node = node;
    this.env = env;
});

IUserFunction.prototype.toString = function () {
    return '[Function]';
};

IUserFunction.prototype.invoke = function (args, env, ctx) {
    var fun = this;

    // User functions don't force their arguments
    evaluateMulti(env.evaluate.bind(env), args,
                  ctx.pushCont(function (evaled_args) {
        var subenv = new Environment(fun.env);
        var params = fun.node.params;
        for (var i = 0; i < params.length; i++)
            subenv.bind(params[i], evaled_args[i]);

        subenv.evaluateStatements(fun.node.elements,
                                  ctx.pushHandler(function (type, val) {
            if (type === 'return')
                ctx.succeed(val);
            else if (type !== 'exception')
                ctx.fail(new Error('unexpected ' + type + ' (in function)'));

            // Exceptions are propogated up to the caller
        }));
    }));
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

// The simplest form of builtin: Gets its arguments evaluated, and
// returns a simple result.
function builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = function (args, env, ctx) {
        evaluateMulti(env.evaluateForced.bind(env), args,
                      ctx.pushCont(function (evaled_args) {
            try {
                // evaluateForced will have left us with IValues, so
                // convert to JS values
                for (var i = 0; i < args.length; i++)
                    evaled_args[i] = IValue.to_js(evaled_args[i]);

                ctx.succeed(IValue.from_js(fun.apply(null, evaled_args)));
            }
            catch (e) {
                ctx.fail(e);
            }
        }));
    };
    return res;
}

// A builtin the gets its arguments evaluated, and returns a promise
// which allows it to block the interpreter.
function promised_builtin(fun) {
    var res = new IBuiltinFunction();
    res.invoke = function (args, env, ctx) {
        evaluateMulti(env.evaluateForced.bind(env), args,
                      ctx.pushCont(function (evaled_args) {
            var p;
            try {
                // evaluateForced will have left us with IValues, so
                // convert to JS values
                for (var i = 0; i < args.length; i++)
                    evaled_args[i] = IValue.to_js(evaled_args[i]);

                p = fun.apply(null, evaled_args);
            }
            catch (e) {
                ctx.fail(e);
            }

            ctx.pause();
            p.then(function (val) { ctx.resume(IValue.from_js(val)); },
                   function (err) { ctx.resumeFail(err); });
        }));
    };
    return res;
}

// Objects

var IObject = itype('object', IValue, function (obj) {
    // IObjects always hold IValues
    this.obj = {};

    for (var p in obj)
        this.obj[p] = IValue.from_js(obj[p]);
});

IObject.prototype.truthy = function () {
    for (var p in this.obj) {
        if (hasOwnProperty(this.obj, p))
            return true;
    }

    return false;
};

IObject.prototype.toString = function () {
    return util.inspect(this.obj);
};

IObject.prototype.getProperty = function (key, ctx) {
    key = IValue.to_js(key);
    // Avoid the prototype chain
    ctx.succeed(hasOwnProperty(this.obj, key) ? this.obj[key] : iundefined);
};

IObject.prototype.setProperty = function (key, val, ctx) {
    // AssignmentOperator already coerced val to an IValue
    this.obj[IValue.to_js(key)] = val;
    ctx.succeed();
};

IObject.prototype.invokeMethod = function (name, args, env, ctx) {
    // Try methods first
    var m = this['im_'+name];
    if (m) {
        m.call(this, args, env, ctx);
        return;
    }

    // Otherwise interpret method invocations as property accesses
    var prop = hasOwnProperty(this.obj, name) ? this.obj[name] : iundefined;
    force(prop, ctx.pushCont(function (val) { val.invoke(args, env, ctx); }));
};

IObject.encoded_property_name_re = /^!+$/;

IObject.prototype.renderJSON = function (callback) {
    var obj = this.obj;
    var res = {};

    for (var p in obj) {
        if (hasOwnProperty(obj, p)) {
            var val = obj[p];
            if (IObject.encoded_property_name_re.test(p))
                p = '!' + p;

            res[p] = IValue.renderJSON(val, callback);
        }
    }

    return res;
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
        for (p in encoded)
            json[p] = encoded[p];

    return new IObject(json);
};

// Lazies

var ILazy = itype('lazy', IValue, function (producer) {
    this.producer = producer;
});

// Methods on a lazy are deferred, i.e. they yield a lazy that when
// forced, forcesthe underlying object in turn and invokes the method
// on it.
ILazy.prototype.invokeMethod = function (name, args, env, ctx) {
    var self = this;
    ctx.succeed(new ILazy(function (ctx) {
        self.force(ctx.pushCont(function (val) {
            val.invokeMethod(name, args, env, ctx);
        }));
    }));
};

ILazy.prototype.toString = function () {
    if (this.producer)
        return this.typename + '(unforced)';
    else if ('value' in this)
        return this.typename + '(forced: ' + this.value + ')';
    else if ('error' in this)
        return this.typename + '(error: ' + this.error + ')';
    else
        return this.typename + '(forcing)';
};

ILazy.prototype.force = function (ctx) {
    var self = this;

    self.force = ILazy.forcing;
    self.awaiting = [];
    self.context = ctx;

    function on_value(val) {
        self.force = ILazy.forced;
        self.value = val;
        self.awaiting.forEach(function (octx) { octx.resume(val); });
        self.awaiting = null;
        self.context = null;
        ctx.succeed(val);
    }

    function on_abort(type, val) {
        // return etc. within a lazy would be a bad idea
        if (type !== 'exception')
            val = new Error(type + ' within lazy');

        self.force = ILazy.error;
        self.error = val;
        self.awaiting.forEach(function (octx) { octx.resumeFail(val); });
        self.awaiting = null;
        self.context = null;

        // Explicitly propagate exceptions, because of the case where
        // we handle non-exception aborts.
        ctx.fail(val);
    }

    this.producer(ctx.pushCont(function (val) {
        force(val, ctx.pushCont(on_value).pushHandler(on_abort));
    }).pushHandler(on_abort));
    this.producer = null;
};

ILazy.forcing = function (ctx) {
    if (ctx === this.context)
        throw new Error("Lazy value depends on itself");

    ctx.pause();
    this.awaiting.push(ctx);
};

ILazy.forced = function (ctx) {
    ctx.succeed(this.value);
};

ILazy.error = function (ctx) {
    ctx.fail(this.error);
};

ILazy.next_json_id = 0;

// render the lazy to JSON.  If the ILazy has not been forced yet,
// this returns the stub JSON for the ILazy, and later calls the
// callback.  The callback takes (id, err, json), where:
// - id is the id provided in the stub JSON.
// - err is an error, or falsy if the ILazy was forced successfully.
// - json is the JSON for the forced value.
ILazy.prototype.renderJSON = function (callback) {
    // Can we promptly return the forced value/error?
    if ('value' in this)
        return IValue.renderJSON(this.value, callback);

    if ('error' in this)
        throw this.error;

    if (!this.id)
        this.id = ILazy.next_json_id++;

    if (callback) {
        // Asynchronously force the lazy
        var self = this;
        process.nextTick(function () {
            var ctx = new Context();
            ctx.run(function () {
                self.force(ctx.pushCont(function (val) {
                    ctx.pause();
                    callback(self.id, null, IValue.renderJSON(val, callback));
                }).pushHandler(function (type, val) {
                    ctx.pause();
                    // forcing can only yield exception aborts
                    callback(self.id, val);
                }));
            });
        });
    }

    return { '!': 'lazy', id: this.id };
};

json_decoder.lazy = function (json) {
    // The JSON form of an ILazy does not record the producer, so we
    // can't faithfully reconstruct the ILazy.  In other words, we
    // cannot freeze and thaw an ongoing computation.

    return new ILazy(function (ctx) {
        ctx.fail(new Error("discarded lazy"));
    });
};

// Sequences

var inil = singleton_itype('nil', {
    truthy: function () { return false; },
    toString: function () { return '[]'; },
    getProperty: continuate(function (key, ctx) { return iundefined; }),
    renderJSON: function () { return []; },
    toSequence: function () { return this; },

    im_map: continuate(function (args, env) { return inil; }),
    im_concat: continuate(function (args, env) { return inil; }),
    im_where: continuate(function (args, env) { return inil; }),
});

var ICons = itype('cons', IValue, function (head, tail) {
    this.head = head;
    this.tail = tail;
});

ICons.prototype.toString = function () {
    return '[' + IValue.from_js(this.head) + ' | ' + this.tail + ']';
};

ICons.prototype.renderJSON = function (callback) {
    return {
        '!': 'cons',
        head: IValue.renderJSON(this.head, callback),
        tail: IValue.renderJSON(this.tail, callback)
    };
};

json_decoder.cons = function (json) {
    return new ICons(IValue.decodeJSON(json.head),
                     IValue.decodeJSON(json.tail));
};

ICons.prototype.toSequence = function () {
    return this;
};

ICons.prototype.getProperty = function (key, ctx) {
    key = IValue.to_js(key);
    if (key === 0) {
        ctx.succeed(this.head);
    }
    else if (typeof(key) === 'number') {
        force(this.tail, ctx.pushCont(function (tail) {
            tail.getProperty(key - 1, ctx);
        }));
    }
    else {
        ctx.succeed(iundefined);
    }
};

function apply_deferred_arg(defarg, env, elem, ctx) {
    var varname;
    var body;
    var subenv = env;

    switch (defarg.length) {
    case 1:
        varname = '_';
        body = defarg[0];

        // If the element is an object, turn it into a frame in the
        // environment
        if (elem instanceof IObject)
            subenv = new Environment(subenv, elem.obj);

        break;

    case 2:
        if (defarg[0].type !== 'Variable') {
            ctx.fail(new Error('expected variable, got ' + defarg[0].type));
            return;
        }

        varname = defarg[0].name;
        body = defarg[1];
        break;

    case 3:
        ctx.fail(new Error('deferred argument looks strange'));
        return;
    }

    subenv = new Environment(subenv);
    subenv.bind(varname, elem);
    subenv.evaluate(body, ctx);
}

ICons.prototype.im_map = continuate(function (args, env) {
    var self = this;
    return new ILazy(function (ctx) {
        apply_deferred_arg(args, env, self.head, ctx.pushCont(function (head) {
            self.tail.invokeMethod('map', args, env,
                                   ctx.pushCont(function (tail) {
                ctx.succeed(new ICons(head, tail));
            }));
        }));
    });
});

ICons.prototype.im_where = continuate(function (args, env) {
    var self = this;
    return new ILazy(function (ctx) {
        apply_deferred_arg(args, env, self.head, ctx.pushCont(function (pass) {
            truthify(pass, ctx.pushCont(function (pass) {
                self.tail.invokeMethod('where', args, env,
                                       ctx.pushCont(function (next) {
                    if (pass)
                        next = new ICons(self.head, next);
                    ctx.succeed(next);
                }));
            }));
        }));
    });
});

// flatten a sequence of sequences
//
// concat [] = []
// concat []:t = concat t
// concat [h:t1]:t2 = h:(concat [t1]:t2)
ICons.prototype.im_concat = continuate(function (args, env) {
    function concat(head, tail) {
        return new ILazy(function (ctx) {
            force(head, ctx.pushCont(function (head) {
                head = head.toSequence();
                if (head === inil)
                    tail.invokeMethod('concat', args, env, ctx);
                else
                    ctx.succeed(new ICons(head.head, concat(head.tail, tail)));
            }));
        });
    }

    return concat(this.head, this.tail);
});

function range(from, to, step) {
    step = step || 1;

    return new ILazy(continuate(function () {
        if (step * from > step * to)
            return inil;
        else
            return new ICons(from, range(from + step, to, step));
    }));
}


// Arrays

var IArray = itype('array', IObject, function (arr) {
    this.obj = arr.map(IValue.from_js);
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

IArray.prototype.im_map = function (args, env, ctx) {
    this.toSequence().im_map(args, env, ctx);
};

IArray.prototype.im_where = function (args, env, ctx) {
    this.toSequence().im_where(args, env, ctx);
};

IArray.prototype.im_concat = function (args, env, ctx) {
    this.toSequence().im_concat(args, env, ctx);
};

IArray.prototype.renderJSON = function (callback) {
    var res = [];
    var arr = this.obj;

    for (var i = 0; i < arr.length; i++)
        res.push(IValue.renderJSON(arr[i], callback));

    return res;
};

IArray.decodeJSON = function (json) {
    return new IArray(json.map(IValue.decodeJSON));
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

ITable.prototype.renderJSON = function (callback) {
    return {
        '!': 'table',
        data: IValue.renderJSON(this.data, callback),
        columns: IValue.renderJSON(this.data, callback)
    };
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

// This is just for debugging
Environment.prototype.runSimple = function (p, cont, econt, dump_parse) {
    try {
        p = parser.parse(p);
        if (dump_parse)
            console.log(JSON.stringify(p, null, "  "));
    }
    catch (e) {
        econt(e);
        return;
    }

    var ctx = new Context();
    var self = this;
    ctx.run(function () {
        self.evaluate(p, ctx.pushCont(function (val) {
            ctx.pause();
            cont(val);
        }).pushHandler(function (type, val) {
            if (type !== 'exception')
                val = new Error('unexpected ' + type + ' (in runSimple)');

            econt(val);
        }));
    });
};

// Run an expression, and return the result as JSON.  See
// ILazy.prototype.renderJSON for details of the callback.
Environment.prototype.run = function (p, callback, dump_parse) {
    p = parser.parse(p);
    if (dump_parse)
        console.log(JSON.stringify(p, null, "  "));

    var self = this;
    var lazy = new ILazy(function (ctx) { self.evaluate(p, ctx); });

    return lazy.renderJSON(callback);
};

Environment.prototype.bind = function (symbol, val) {
    this.frame[symbol] = val;
};

Environment.prototype.variable = function (symbol, ctx) {
    var env = this;
    while (!(symbol in env.frame)) {
        env = env.parent;
        if (!env) {
            ctx.fail(new Error("unbound variable '" + symbol + "'"));
            return;
        }
    }

    ctx.succeed({
        get: function (ctx) {
            ctx.succeed(env.frame[symbol]);
        },
        set: function (val, ctx) {
            env.frame[symbol] = val;
            ctx.succeed();
        }
    });
};

Environment.prototype.evaluateForced = function (node, ctx) {
    this.evaluate(node, ctx.pushCont(function (val) { force(val, ctx); }));
};

// Evaluate an array of expressions using the passed evaluation function
function evaluateMulti(evaluator, items, ctx) {
    var evaled = [];

    function do_items(i) {
        if (i == items.length) {
            ctx.succeed(evaled);
            return;
        }

        evaluator(items[i], ctx.pushCont(function (a) {
            evaled.push(a);
            do_items(i + 1);
        }));
    }

    do_items(0);
}

Environment.prototype.evaluateStatements = function (stmts, ctx) {
    var env = this;

    function do_elements(i, last) {
        if (i == stmts.length) {
            ctx.succeed(last);
            return;
        }

        env.evaluate(stmts[i], ctx.pushCont(function (last) {
            do_elements(i + 1, last);
        }));
    }

    do_elements(0, iundefined);
};

Environment.prototype.evaluatePropertyName = function (name, ctx) {
    if (typeof(name) === 'object')
        // it's a foo[bar] PropertyAccess
        this.evaluateForced(name, ctx);
    else
        // it's a foo.bar PropertyAccess
        ctx.succeed(name);
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
    Variable: function (node, env, ctx) {
        env.variable(node.name, ctx);
    },

    PropertyAccess: function (node, env, ctx) {
        env.evaluateForced(node.base, ctx.pushCont(function (base) {
            env.evaluatePropertyName(node.name, ctx.pushCont(function (name) {
                ctx.succeed({
                    get: function (ctx) {
                        base.getProperty(name, ctx);
                    },
                    set: function (val, ctx) {
                        base.setProperty(name, val, ctx);
                    }
                });
            }));
        }));
    },
};

Environment.prototype.evaluateLValue = function (node, ctx) {
    var handler = evaluate_lvalue_type[node.type];
    if (handler)
        handler(node, this, ctx);
    else
        ctx.fail(new Error(node.type + " not an lvalue"));
};

// to convert from assignment operators to the corresponding binary operators
var assignment_to_binary_op = {};
binary_operators.forEach(function (op) {
    assignment_to_binary_op[op+'='] = op;
});

function evaluate_literal(node, env, ctx) {
    ctx.succeed(node.value);
}

function evaluate_comprehension(node, env, ctx) {
    var varnode = [];
    if (node.name)
        varnode.push({ type: 'Variable', name: node.name });

    env.evaluate(node.generate, ctx.pushCont(function (seq) {
        // we don't want to force seq, but we do need to handle
        // the case where it is a JS array.
        seq = IValue.from_js(seq);

        function do_map(seq) {
            seq.invokeMethod('map', varnode.concat(node['yield']), env, ctx);
        }

        if (!node.guard)
            do_map(seq);
        else
            seq.invokeMethod('where', varnode.concat(node.guard), env,
                             ctx.pushCont(do_map));
    }));
}

var evaluate_type = {
    Literal: evaluate_literal,
    NumericLiteral: evaluate_literal,
    StringLiteral: evaluate_literal,

    NullLiteral: function (_node, _env, ctx) {
        ctx.succeed(inull);
    },

    EmptyStatement: function (node, env, ctx) {
        ctx.succeed(iundefined);
    },

    Program: function (node, env, ctx) {
        env.evaluateStatements(node.elements, ctx);
    },

    Block: function (node, env, ctx) {
        env.evaluateStatements(node.statements, ctx);
    },

    BinaryExpression: function (node, env, ctx) {
        env.evaluateForced(node.left, ctx.pushCont(function (a) {
            env.evaluateForced(node.right, ctx.pushCont(function (b) {
                try {
                    ctx.succeed(a[node.operator](b));
                }
                catch (e) {
                    ctx.fail(e);
                }
            }));
        }));
    },

    VariableStatement: function (node, env, ctx) {
        var decls = node.declarations;

        function do_decls(i) {
            var decl;

            for (;;) {
                if (i == decls.length) {
                    ctx.succeed(iundefined);
                    return;
                }

                decl = decls[i];
                if (decl.value)
                    break;

                env.bind(decl.name, iundefined);
                i++;
            }

            env.evaluate(decl.value, ctx.pushCont(function (val) {
                env.bind(decl.name, val);
                do_decls(i + 1);
            }));
        }

        do_decls(0);
    },

    StringPattern: function (node, env, ctx) {
        evaluateMulti(env.evaluateForced.bind(env), node.elements,
                      ctx.pushCont(function (pieces) {
            ctx.succeed(pieces.join(''));
        }));
    },

    FunctionCall: function (node, env, ctx) {
        if (node.name.type == 'PropertyAccess') {
            // It might be a method call
            env.evaluateForced(node.name.base, ctx.pushCont(function (base) {
                env.evaluatePropertyName(node.name.name,
                                         ctx.pushCont(function (name) {
                    base.invokeMethod(name, node['arguments'], env, ctx);
                }));
            }));

        }
        else {
            env.evaluateForced(node.name, ctx.pushCont(function (fun) {
                fun.invoke(node['arguments'], env, ctx);
            }));
        }
    },

    ReturnStatement: function (node, env, ctx) {
        env.evaluate(node.value, ctx.pushCont(function (val) {
            ctx.abort('return', val);
        }));
    },

    Function: function (node, env, ctx) {
        var fun = new IUserFunction(node, env);
        if (node.name)
            env.bind(node.name, fun);

        ctx.succeed(fun);
    },

    TryStatement: function (node, env, ctx) {
        env.evaluateStatements(node.block.statements,
                               ctx.pushHandler(function (type, val) {
            if (type !== 'exception')
                return;

            var katch = node['catch'];
            var subenv = new Environment(env);
            subenv.bind(katch.identifier, val);
            subenv.evaluateStatements(katch.block.statements, ctx);
        }));
    },

    ThrowStatement: function (node, env, ctx) {
        env.evaluateForced(node.exception, ctx.pushCont(function (val) {
            ctx.fail(val);
        }));
    },

    AssignmentExpression: function (node, env, ctx) {
        env.evaluateLValue(node.left, ctx.pushCont(function (lval) {
            if (node.operator === '=') {
                env.evaluate(node.right, ctx.pushCont(function (val) {
                    lval.set(IValue.from_js(val), ctx.pushCont(function () {
                        ctx.succeed(val);
                    }));
                }));
            }
            else {
                // Force the left side before we evaluate the right side.
                lval.get(ctx.pushCont(function (a) {
                    force(a, ctx.pushCont(function (a) {
                        env.evaluateForced(node.right,
                                           ctx.pushCont(function (b) {
                            try {
                                var res = a[assignment_to_binary_op[node.operator]](b);
                                lval.set(res, ctx.pushCont(function () {
                                    ctx.succeed(res);
                                }));
                            }
                            catch (e) {
                                ctx.fail(e);
                            }
                        }));
                    }));
                }));
            }
        }));
    },

    ObjectLiteral: function (node, env, ctx) {
        var props = node.properties;
        var res = {};

        function do_props(i) {
            if (i == props.length)
                ctx.succeed(new IObject(res));
            else
                env.evaluate(props[i].value, ctx.pushCont(function (val) {
                    res[props[i].name] = val;
                    do_props(i + 1);
                }));
        }

        do_props(0);
    },

    ArrayLiteral: function (node, env, ctx) {
        evaluateMulti(env.evaluate.bind(env), node.elements,
                      ctx.pushCont(function (arr) {
            ctx.succeed(new IArray(arr));
        }));
    },

    ComprehensionMapExpression: evaluate_comprehension,
    ComprehensionConcatMapExpression: function (node, env, ctx) {
        evaluate_comprehension(node, env, ctx.pushCont(function (res) {
            res.invokeMethod('concat', [], env, ctx);
        }));
    },
};

function lvalue_handler_to_rvalue_handler(lvalue_handler) {
    return function (node, env, ctx) {
        lvalue_handler(node, env, ctx.pushCont(function (lval) {
            lval.get(ctx);
        }));
    };
}

// Convert all lvalue handlers to rvalue handlers
for (var t in evaluate_lvalue_type) {
    evaluate_type[t] = lvalue_handler_to_rvalue_handler(evaluate_lvalue_type[t]);
}

Environment.prototype.evaluate = function (node, ctx) {
    var handler = evaluate_type[node.type];
    if (handler)
        handler(node, this, ctx);
    else
        ctx.fail(new Error(node.type + " not yet implemented"));
};

// Builtins

var builtins = new Environment();
builtins.bind('nil', inil);
builtins.bind('undefined', iundefined);
builtins.bind('range', builtin(range));

builtins.bind('lazy', deferred_builtin(function (args, env, ctx) {
    ctx.succeed(new ILazy(function (ctx2) {
        env.evaluateForced(args[0], ctx2);
    }));
}));

builtins.bind('table', builtin(function (data, cols) {
    return new ITable(data, cols);
}));

function run(p) {
    builtins.runSimple(p,
                 function (val) { console.log("=> " + IValue.from_js(val)); },
                 function (err) { console.log("=! " + err.stack); },
                 true);
}

//builtins.bind('print', builtin(function (x) { console.log(x); }));

module.exports.IValue = IValue;
module.exports.Environment = Environment;
module.exports.builtins = builtins;
module.exports.builtin = builtin;
module.exports.promised_builtin = promised_builtin;
module.exports.hasOwnProperty = hasOwnProperty;
