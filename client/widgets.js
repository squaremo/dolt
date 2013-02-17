var Widget = (function() {

    function Widget() {
        Observable.call(this);
    }
    Widget.prototype = inheritFrom(Observable);

    var render = procedure('render');
    Widget.render = render;

    Widget.renderInto = function (val, container) {
        var strbuf = '';
        
        function flush() {
            if (strbuf) {
                container.append(document.createTextNode(strbuf));
                strbuf = '';
            }
        }

        function appender(stuff) {
            if (typeof(stuff) === 'string') {
                strbuf += stuff;
            }
            else {
                flush();
                container.append(stuff);
            }
        }

        render(val, appender);
        flush();
    }

    return Widget;
})();

function ExpressionWidget(expr) {
    Widget.call(this);
    this.expr = expr;
}

ExpressionWidget.prototype = inheritFrom(Widget);

Widget.render.method(ExpressionWidget, Function, function(ew, appender) {
    var ast;
    try {
        ast = Parser.parse(ew.expr);
    }
    catch (parseError) {
        appender($('<span/>').addClass('syntax-error').text(ew.expr));
    }

    appender(unparseAsHTML(ast));

    function unparseAsHTML(node) {
    
        function varname(name) {
            return $('<var/>').text(name);
        }
        function punc(chars) {
            return document.createTextNode(chars);
        }
        function val(node, text) {
            return $('<span/>').addClass(node.type).text(text || node.value);
        }
        function kw(chars) {
            return $('<span/>').addClass('keyword').text(chars);
        }
        function decl(node) {
            if (node.value !== null) {
                return flatlist(varname(node.name), s(), punc('='), s(), unparseAsHTML(node.value));
            }
            else {
                return varname(node.name);
            }
        }
        function s() {
            return document.createTextNode(' ');;
        }

        function flatlist() {
            var elems = $(arguments[0]);
            for (var i = 1; i < arguments.length; i++) {
                var elem = arguments[i];
                if (Array.isArray(elem)) elem = flatlist.apply(null, elem);
                elems = elems.add(elem);
            }
            return elems;
        }
        
        function commafied(list, fun) {
            if (list.length === 0) {
                return $([]);
            }
            var elems = fun(list[0]);
            for (var i = 1; i < list.length; i++) {
                elems = elems.add(punc(','));
                elems = elems.add(fun(list[i]));
            }
            return elems;
        }
        
        function unparsePatternAsHTML(node) {
            if (node.type === 'StringLiteral') {
                return val(node);
            }
            else {
                return flatlist(punc('{'), unparseAsHTML(node), punc('}'));
            }
        }
        
        function generatorexpr(node) {
            expr = unparseAsHTML(node.generate);
            if (node.name) {
                expr = flatlist(varname(node.name), s(), kw('in'), s(), expr);
            }
            if (node.guard) {
                expr = flatlist(expr, s(), kw('if'), s(), unparseAsHTML(node.guard));
            }
            return expr;
        }
        
        
        switch (node.type) {
        case 'Program':
            return $.map(node.elements, unparseAsHTML);
        case 'This':
            return $('<span/>').addClass('this').text('this');
        case 'Variable':
            return varname(node.name);
        case 'AssignmentExpression':
            return flatlist(unparseAsHTML(node.left), s(), kw('='), s(), unparseAsHTML(node.right));
        case 'PropertyAccess':
            var name;
            if (typeof node.name === 'string')
                name = flatlist(punc('.'), varname(node.name));
            else
                name = flatlist(punc('['), unparseAsHTML(node.name), punc(']'));
            return flatlist(unparseAsHTML(node.base), name);
        case 'IdentifierName':
            return varname(node.name);
        case 'StringLiteral':
            return flatlist(punc("'"), val(node), punc("'"));
        case 'StringPattern':
            return flatlist(punc('"'), $.map(node.elements, unparsePatternAsHTML), punc('"'));
        case 'NumericLiteral':
        case 'BooleanLiteral':
            return val(node);
        case 'NullLiteral':
            return val(node, 'null');
        case 'ArrayLiteral':
            return flatlist(punc('['), commafied(node.elements, unparseAsHTML), punc(']'));
        case 'ObjectLiteral':
            return flatlist(punc('{'), commafied(node.properties, function(pa) {
                return flatlist(varname(pa.name), punc(':'), s(), unparseAsHTML(pa.value));
            }), punc('}'));
        case 'BinaryExpression': // %%% yeah I know, precedence
            return flatlist(unparseAsHTML(node.left), kw(node.operator), unparseAsHTML(node.right));
        case 'UnaryExpression':
            return flatlist(kw(node.operator), unparseAsHTML(node.expression));
        case 'PostfixExpression':
            return flatlist(unparseAsHTML(node.expression), kw(node.operator));
        case 'NewOperator':
            return flatlist(punc('new'), s(), unparseAsHTML(node.constructor));
        case 'FunctionCall':
            return flatlist(unparseAsHTML(node.name), punc('('), commafied(node.arguments, unparseAsHTML), punc(')'));
        case 'VariableStatement':
            return flatlist(kw('var'), s(), commafied(node.declarations, decl));
        case 'ComprehensionMapExpression':
            return flatlist(punc('['),
                            unparseAsHTML(node.yield),
                            s(), kw('for'), s(),
                            generatorexpr(node), punc(']'));
        case 'ComprehensionConcatMapExpression':
            var inner = node.yield;
            var generators = generatorexpr(node);
            while (inner.type === 'ComprehensionConcatMapExpression') {
                generators = flatlist(generators, punc(';'), s(), generatorexpr(inner));
                inner = inner.yield;
            }
            return flatlist(punc('['), unparseAsHTML(inner.yield), s(),
                            kw('for'), s(), generators, punc(';'), s(),
                            generatorexpr(inner),
                            punc(']'));
            // TODO: AssignmentExpression, Function, Block, various *Statement
        default:
            return $('<span/>').text("UNIMPLEMENTED: " + node.type);
        }
    }

});
