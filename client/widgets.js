// This is the same as the conventional
// `Sub.prototype = new Super();`
// except that it avoids running Super (but that can of course be done
// in Sub if desired).
function inheritFrom(parentConstructor) {
    function constr() {}
    constr.prototype = parentConstructor.prototype;
    return new constr();
}

var Widget = (function() {

    function Widget() {
    }

    var render = procedure('render');
    var visualSize = procedure('visualSize');

    // primitives are given as the value rather than a widget
    render.method(Object, Function, function(val, appender) {
        appender($('<code/>').addClass(typeof(val)).text(String(val)));
    });
    visualSize.method(Object, function(val) {
        return String(val).length;
    });

    render.method(String, Function, function(str, appender) {
        appender($('<code/>').addClass('string').text('"' + str + '"'));
    });
    visualSize.method(String, function(str) {
        return str.length + 2;
    });

    // For subclasses
    visualSize.method(Widget, function(w) {
        return w.size;
    });

    Widget.prototype.isCompact = function () {
        return !isNaN(this.size);
    };

    function ArrayWidget(arr) {
        this.arr = arr;

        var size = 0;
        var separators = 0;

        for (var i = 0; i < arr.length; i++) {
            arr[i] = Widget.widgetize(arr[i], this);
            size += visualSize(arr[i]) + separators;
            separators = 2;
        }

        this.size = size + 2;
    }

    ArrayWidget.prototype = inheritFrom(Widget);

    render.method(ArrayWidget, Function, function(aw, appender) {
        appender('[');
        var arr = aw.arr;

        if (aw.isCompact()) {
            var sep = '';

            for (var i = 0; i < arr.length; i++) {
                appender(sep);
                render(arr[i], appender);
                sep = ', ';
            }
        }
        else {
            var tab = $('<table/>').addClass('array');
            appender(tab);

            for (var i = 0; i < arr.length; i++) {
                var td = $('<td/>');
                tab.append($('<tr/>').append(td));
                Widget.renderInto(arr[i], td);
                if (i < this.arr.length - 1)
                    td.append(',');
            }
        }

        appender(']');
    });

    // RE matching keys that were encoded to differentiate them from
    // the magic '!' type property.
    var encoded_property_name_re = /^!+$/;

    function ObjectWidget(obj) {
        this.obj = obj;
        this.keys = Object.getOwnPropertyNames(obj).sort();

        var size = 0;
        var separators = 2;

        for (var i = 0; i < this.keys.length; i++) {
            var k = this.keys[i];

            if (encoded_property_name_re.test(k)) {
                // Here we rely on the fact that sorting the keys will
                // have put the encoded keys in the right order so
                // that we don't overwrite properties when decoding.
                // I.e., we decode '!!'  first, then '!!!', then
                // '!!!!', etc.
                var decoded = k.substring(1);
                obj[decoded] = Widget.widgetize(obj[k], this);
                delete obj[k];
                k = this.keys[i] = decoded;
            }
            else {
                obj[k] = Widget.widgetize(obj[k], this);
            }

            size += visualSize(obj[k]) + k.length + separators;
            separators = 4;
        }

        // If an object becomes too cumbersome, present it as a table
        if (size > 50)
            size = undefined;
        else
            size += 2;

        this.size = size;
    }

    ObjectWidget.prototype = inheritFrom(Widget);

    render.method(ObjectWidget, Function, function (ow, appender) {
        appender('{');

        if (ow.isCompact()) {
            var sep = '';

            for (var i = 0; i < ow.keys.length; i++) {
                appender(sep);
                var k = ow.keys[i];
                appender(k);
                appender(': ');
                Widget.render(ow.obj[k], appender);
                sep = ', ';
            }
        }
        else {
            var tab = $('<table/>').addClass('object');
            appender(tab);

            for (var i = 0; i < ow.keys.length; i++) {
                var k = ow.keys[i];
                var td = $('<td/>');
                tab.append($('<tr/>')
                           .append($('<td/>').addClass('key').text(k + ':'))
                           .append(td));
                Widget.renderInto(ow.obj[k], td);
                if (i < ow.keys.length - 1)
                    td.append(',');
            }
        }

        appender('}');
    });

    // For types given by a '!' annotation. We make this a generic
    // procedure so it can be added to elsewhere.
    var widgetizeSpecial = procedure('widgetizeSpecial');
    // Transform unsupplied parent arguments to nulls, so we can
    // specialise on Object if we're OK with missing values
    widgetizeSpecial.method(String, Object, undefined, function(type, val) {
        return widgetizeSpecial(type, val, null);
    });

    widgetizeSpecial.method(String, Object, Object, function() {
        return 'UNKNOWN TYPE';
    });
    widgetizeSpecial.method('undefined', Object, Object, function() {
        return undefined;
    });

    // This is easier to leave explicit -- it's difficult to
    // dispatch on 'primitive' values as distinct from Objects
    Widget.widgetize = function (val, parent) {
        if (typeof(val) === 'object') {
            if (Array.isArray(val))
                return new ArrayWidget(val, parent);

            var type = val['!'];
            if (type) return widgetizeSpecial(type, val, parent);
            return new ObjectWidget(val);
        }
        else {
            // Primitive values are not turned into widgets
            return val;
        }
    }

    Widget.registerSpecial = function (name, constr) {
        widgetizeSpecial.method(
            name, Object, Object, function(_name, val, parent) {
                return new constr(val, parent);
            });
    };

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

    // So other modules can access these
    Widget.render = render;
    Widget.visualSize = visualSize;

    Widget.renderCompactlyInto = function (val, container) {
        var collapsed = $('<div/>').addClass('collapsed');
        container.append(collapsed);
        return Widget.renderInto(val, collapsed);
    }

    return Widget;
})();

// Table control
(function() {
    function TableWidget(val, parent) {
        this.cols = val.columns.map(function(name) { return {key: name}; });

        var data = val.data;

        for (var i = 0; i < data.length; i++)
            for (var k in data[i])
                data[i][k] = Widget.widgetize(data[i][k], this);

        this.rows = data;
    }

    TableWidget.prototype = inheritFrom(Widget);

    Widget.render.method(TableWidget, Function, function (tw, appender) {
        tw.container = $('<div/>');
        appender(this.container);

        var buttons = $('<span/>').addClass('buttons').appendTo(tw.container);
        tw.installButtons(buttons);
        tw.tbody = $('<tbody/>');

        // The maximum width of the table, based on the viewport size
        var maxwidth = $(window).width() * 0.95

        // btable is the table that will contain the tbody; bdiv wraps
        // btable.
        tw.btable = $('<table/>').css('table-layout', 'auto');
        var bdiv = $('<div/>').css({
            overflow: 'auto',
            'max-height': $(window).height() * 0.8,
            'max-width': maxwidth
        });
        tw.container.append(bdiv.append(this.btable));

        // Construct the column headers
        var hrow = $('<tr/>');
        for (var i = 0; i < tw.cols.length; i++) {
            hrow.append(tw.makeColumnHeader(tw.cols[i]));
        }

        tw.thead = $('<thead/>').append(hrow);
        tw.btable.append(tw.thead).append(tw.tbody);

        tw.populateTBody();

        // Now that the browser has laid out the table, freeze the
        // column widths.
        var totalwidth = 0;
        hrow.children('th').each(function (i) {
            var th = $(tw);
            var width = th.width();
            tw.cols[i].width = width;
            totalwidth += width;
        });

        var tablecss = {
            'table-layout': 'fixed',
            'width': totalwidth
        };

        tw.btable.css(tablecss);

        // Construct a separate table to contain the column headers
        // (so that the body table can be scrolled vertically while
        // the column headers remain visible).  hdiv contains this
        // table.  The padding right is a fudge to avoid an anomaly
        // when the table is scrolled to the extreme right.
        tw.htable = $('<table/>').css(tablecss).css('padding-right', 100).append(tw.thead);
        var hdiv = $('<div/>').css({
            overflow: 'hidden',
            'max-width': maxwidth
        }).append(tw.htable).insertBefore(bdiv);

        function setWidths(elems) {
            elems.each(function (i) {
                $(tw).css('width', tw.cols[i].width);
            });
        }

        setWidths(tw.thead.children('tr').children('th'));
        setWidths(tw.tbody.children('tr:first').children('td'));

        // Lock the scrolling of the header table to the body table.
        bdiv.scroll(function () {
            hdiv.scrollLeft(bdiv.scrollLeft());
        });
    });

    function sortByKey(rows, key, descending) {
        var i = 0;
        var enumrows = rows.map(function (row) {
            return {
                index: i++,
                row: row
            };
        });

        // We re-use 'descending' as the value desired from the
        // comparator function when the arguments are in descending
        // order.  I.e., 1 when sorting into ascending order, and -1
        // if sorting into descending order.
        descending = (descending ? -1 : 1)

        enumrows.sort(function (a, b) {
            var aval = a.row[key];
            var bval = b.row[key];

            if (typeof(aval) === 'number') {
                if (typeof(bval) === 'number') {
                    if (aval < bval) {
                        return -descending;
                    } else if (aval > bval) {
                        return descending;
                    }
                } else {
                    // Let's say that numbers come before non-Numbers
                    return -descending;
                }
            } else if (typeof(bval) === 'number') {
                return descending;
            } else {
                // Both non-numbers
                var res = String(aval).localeCompare(String(bval));
                if (res != 0) {
                    return res * descending;
                }
            }

            // Values are equalish, so maintain existing order
            return (a.index - b.index) * descending;
        });

        return enumrows.map(function (er) { return er.row; });
    };

    TableWidget.prototype.sortOn = function (col) {
        var descending = (this.sortedby === col && !this.sortdescending);
        this.rows = sortByKey(this.rows, col.key, descending);

        if (this.sortedby !== undefined) {
            this.sortedby.header.removeClass('ascending descending');
        }

        this.sortedby = col;
        this.sortdescending = descending;
        this.setSortIndicator();
        this.populateTBody();
    };

    TableWidget.prototype.setSortIndicator = function (col) {
        this.sortedby.header.addClass(this.sortdescending ? 'descending'
                                                          : 'ascending');
    };

    TableWidget.prototype.makeColumnHeader = function (col) {
        var self = this;
        col.header = $('<th>').text(col.key).click(function() {
            self.sortOn(col);
        });
        if (col.width) { col.header.css('width', col.width); }
        if (this.sortedby === col) { this.setSortIndicator(); }
        return col.header;
    };

    TableWidget.prototype.fillCell = function (td, col, row) {
        // We only need to add width properties on the first row
        if (!row && col.width)
            td.css('width', col.width);

        Widget.renderInto(this.rows[row][col.key], td);
    };

    TableWidget.prototype.populateTBody = function () {
        var tbody = this.tbody;
        tbody.empty();

        var colwidths = this.colwidths;
        for (var i = 0; i < this.rows.length; i++) {
            var row = $('<tr/>');
            tbody.append(row);

            for (var j = 0; j < this.cols.length; j++) {
                var col = this.cols[j];
                var td = $('<td>');
                row.append(td);

                if (col.header)
                    this.fillCell(td, col, i);
            }
        }
    };

    TableWidget.prototype.selectColumns = function () {
        var columnsform = $('<form/>');
        this.container.prepend(columnsform);

        for (var i = 0; i < this.cols.length; i++) {
            var col = this.cols[i];
            columnsform.append($('<label/>')
                                   .append(this.columnShownCheckbox(col))
                                   .append(' ' + col.key + ' '));
        }

        columnsform.append('<input type="submit" value="Done"/>');

        var self = this;
        columnsform.submit(function () {
            columnsform.remove();
            self.columnsbutton.css('display', 'inline');
            return false;
        });
    };

    TableWidget.prototype.columnShownCheckbox = function (col) {
        var self = this;
        var checkbox = $('<input type="checkbox"/>');
        if (col.header) { checkbox.attr("checked", "checked"); }
        checkbox.change(function () {
            var show = !!checkbox.attr("checked");
            if (show) {
                self.showColumn(col);
            }
            else {
                self.unshowColumn(col);
            }
            self.recalcTotalWidth();
        });
        return checkbox;
    };

    TableWidget.prototype.unshowColumn = function (col) {
        var index = this.shownColumnIndex(col);
        col.header.remove();
        col.header = null;
        this.tbody.children('tr').each(function () {
            $(this).children().eq(index).remove();
        });
    };

    TableWidget.prototype.showColumn = function (col) {
        var index = this.shownColumnIndex(col);

        // Insert el under parent at index
        function insert(parent, el) {
            if (index) {
                el.insertAfter($(parent).children().eq(index-1));
            }
            else {
                $(parent).prepend(el);
            }
        }

        var self = this;
        this.thead.children('tr').each(function () {
            insert(this, self.makeColumnHeader(col));
        });
        this.tbody.children('tr').each(function (i) {
            var td = $('<td>');
            insert(this, td);
            self.fillCell(td, col, i);
        });
    };

    // Return the number of shown columns before the given column
    TableWidget.prototype.shownColumnIndex = function (col) {
        var res = 0;
        for (var i = 0; i < this.cols.length; i++) {
            if (this.cols[i] === col) { return res; }
            if (this.cols[i].header) { res++; }
        }
        throw "couldn't find column";
    };

    TableWidget.prototype.recalcTotalWidth = function () {
        var totalwidth = 0;
        for (var i = 0; i < this.cols.length; i++) {
            if (this.cols[i].header) {
                totalwidth += this.cols[i].width;
            }
        }

        this.btable.css('width', totalwidth);
        this.htable.css('width', totalwidth);
    }

    TableWidget.prototype.installButtons = function (buttons) {
        var self = this;
        this.columnsbutton = $('<a href="#" class="button"/>')
            .text('select columns')
            .click(function () {
                self.columnsbutton.css('display', 'none');
                self.selectColumns();
            });
        buttons.append(this.columnsbutton);
    };

    Widget.registerSpecial('table', TableWidget);
})();

function unparseAsHTML(node) {
    
    function varname(name) {
        return $('<var/>').text(name);
    }
    function punc(chars) {
        return document.createTextNode(chars);
    }
    function val(node) {
        return $('<span/>').addClass(node.type).text(node.value);
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
    case 'NullLiteral':
        return val(node);
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
        return flatlist(unparseAsHTML(node.name), punc('('), commafied(node.elements, unparseAsHTML), punc(')'));
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
