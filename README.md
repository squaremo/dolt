# Fun with REPLs

    npm install && npm start
    open http://localhost:8000/

<!-- The name comes from
http://www.folklore.org/StoryView.py?project=Macintosh&story=Do_It.txt
-->

## Language

The language available in the REPL has a syntax largely taken from
JavaScript, with slightly different semantics. The JavaScript-like
essentials are:

    // values
    1, 'foo', true // number, string, boolean literals
    {foo: 1}       // object literal
    [1,2,3]        // array literal
    
    // arithmetic
    1 + 2 - 3 / 4 * 5   // operators
    n += 1  // in-place arithmetic
    n < 3   // comparison

    // other stuff you might expect
    var x = 1      // assignment
    foo.bar       // field access
    frob(1, 'foo')        // procedure call
    
There are no prototypes and no dynamically-scoped `this` variable;
however, fields may be procedures, and some of the built-ins look
like methods.

### Sequences and comprehensions

Sequences are an addition; in general these are produced by built-ins
(e.g., `range` just below) and comprehensions, and are
lazy[[1]](#footnote1). Arrays will be lifted to sequences when treated
as a sequence; sequences may be indexed, in which case they are
evaluated up to the element given.

The built-in `range` produces a sequence starting at its first
argument and ending less than or equal to its second argument, incrementing
by its third argument (or `1` if not supplied).

    range(0, 10, 2) // => 0,2,4,6,8,10 in a sequence
    range(0, 10, 3) // => 0,3,6,9
    range(0, 10)[2] // => 2

<!-- %% No unary ops yet
The step may be negative, in which case it ends greater than or equal
to:

    range(10, 0, -3) // => 10,7,4,1
-->

Sequences support `map`, `where`, and `concat` operations, all
returning lazy sequences. The first two take, in argument position,
an expression to be applied to each element:

    [1,2,3].map(_ + 1)
    range(0, 10).where(_ < 5)

The variable `_` is bound to the element being considered. If the
element is an object, its field names will also be bound when the
expression is evaluated:

    [{foo: 1}, {foo: 2}].map(foo + 1)

The name to be bound may also be supplied, in which case field access must
be explicit:

    [{foo: 1}, {foo: 2}].map(x, x.foo + 1)

The result is always a sequence, so `map` and `where` may be chained together:

    range(0, 10).map(_ + 1).where(_ < 5)

Comprehensions represent sequences by specifying a generating
expression, a map expression, and optionally a where expression:

    [_ + 1 for [1,2,3]]
    [x + 1 for x in [1,2,3]]
    [x + 1 for x in range(0, 10) if x < 5]

These may be nested, in which case the inner generation expression and
where expression have both the outer and inner elements bound:

    [x + y for x in range(0, 10); y in range(0, x) if x * y < 10]

### String interpolation

Strings with double quotes are treated as patterns to be
interpolated. Expressions within curly braces in such a string are
evaluated in the local environment:

    "The answer is {2 + 2}" // => 'The answer is 4'

These can be used in maps and comprehensions, of course:

      ["Foo = {foo}" for [{foo: 1}, {foo: 2}]]

### Object construction

There is shorthand for constructing objects in which the field names
match variable names; this is especially useful in maps and
comprehensions:

    var foo = 1; {foo} // => {foo: 1}
    [{bar} for [{foo: 1, bar: 2}, {foo: 2, bar: 3}]]

------

<a name="footnote1">[1]</a> They are "even streams" as described
(albeit in the context of Scheme) at
<http://srfi.schemers.org/srfi-41/srfi-41.html>.
