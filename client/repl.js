function inheritFrom(parentConstructor) {
    function constr() {}
    constr.prototype = parentConstructor.prototype;
    return new constr();
}

var Widget = (function() {
    function PrimitiveWidget() {}

    PrimitiveWidget.by_type = {};

    PrimitiveWidget.define = function (type, methods) {
        var singleton = new PrimitiveWidget();
        for (var m in methods)
            singleton[m] = methods[m];

        PrimitiveWidget.by_type[type] = singleton;
    };

    'visualSize render'.split(' ').forEach(function (name) {
        Widget[name] = function (val /* ... */) {
            if (val instanceof Widget) {
                return val[name].apply(val,
                                   Array.prototype.slice.call(arguments, 1));
            }
            else {
                var target = PrimitiveWidget.by_type[typeof(val)]
                                             || PrimitiveWidget.prototype;
                return target[name].apply(undefined, arguments);
            }
        };
    });

    PrimitiveWidget.prototype.visualSize = function (val) {
        return String(val).length;
    };

    PrimitiveWidget.prototype.render = function (val, appender) {
        appender($('<code/>').addClass(typeof(val)).text(String(val)));
    };


    PrimitiveWidget.define('string', {
        visualSize: function (val) { return val.length + 2; },

        render: function (val, appender) {
            appender($('<code/>').addClass(typeof(val)).text('"' + val + '"'));
        }
    });


    function Widget() {
    }

    Widget.prototype.visualSize = function () {
        return this.size;
    };

    Widget.prototype.isCompact = function () {
        return !isNaN(this.size);
    };

    function ArrayWidget(arr, parent) {
        this.arr = arr;
        this.parent = parent;

        var size = 0;
        var separators = 0;

        for (var i = 0; i < arr.length; i++) {
            arr[i] = Widget.widgetize(arr[i], this);
            size += Widget.visualSize(arr[i]) + separators;
            separators = 2;
        }

        this.size = size + 2;
    }

    ArrayWidget.prototype = inheritFrom(Widget);

    ArrayWidget.prototype.render = function (appender) {
        appender('[');

        if (this.isCompact()) {
            var sep = '';

            for (var i = 0; i < this.arr.length; i++) {
                appender(sep);
                Widget.render(this.arr[i], appender);
                sep = ', ';
            }
        }
        else {
            var tab = $('<table/>').addClass('array');
            appender(tab);

            for (var i = 0; i < this.arr.length; i++) {
                var td = $('<td/>');
                tab.append($('<tr/>').append(td));
                Widget.renderInto(this.arr[i], td);
                if (i < this.arr.length - 1)
                    td.append(',');
            }
        }

        appender(']');
    };

    // RE matching keys that were encoded to differentiate them from
    // the magic '!' type property.
    var encoded_property_name_re = /^!+$/;

    function ObjectWidget(obj, parent) {
        this.obj = obj;
        this.parent = parent;
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

            size += Widget.visualSize(obj[k]) + k.length + separators;
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

    ObjectWidget.prototype.render = function (appender) {
        appender('{');

        if (this.isCompact()) {
            var sep = '';

            for (var i = 0; i < this.keys.length; i++) {
                appender(sep);
                var k = this.keys[i];
                appender(k);
                appender(': ');
                Widget.render(this.obj[k], appender);
                sep = ', ';
            }
        }
        else {
            var tab = $('<table/>').addClass('object');
            appender(tab);

            for (var i = 0; i < this.keys.length; i++) {
                var k = this.keys[i];
                var td = $('<td/>');
                tab.append($('<tr/>')
                           .append($('<td/>').addClass('key').text(k + ':'))
                           .append(td));
                Widget.renderInto(this.obj[k], td);
                if (i < this.keys.length - 1)
                    td.append(',');
            }
        }

        appender('}');
    };

    var widgetizeSpecial = {
        undefined: function () { return undefined; },
    };

    Widget.widgetize = function (val, parent) {
        if (typeof(val) === 'object') {
            if (Array.isArray(val))
                return new ArrayWidget(val, parent);

            var type = val['!'];
            if (type) {
                var handler = widgetizeSpecial[type];
                if (handler)
                    return handler(val, parent);
                else
                    return "UNKNOWN TYPE";
            }

            return new ObjectWidget(val, parent);
        }
        else {
            // Primitive values are not turned into widgets
            return val;
        }
    }

    Widget.registerSpecial = function (name, constr) {
        widgetizeSpecial[name] = function (val, parent) {
            return new constr(val, parent);
        };
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

        Widget.render(val, appender);
        flush();
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

    TableWidget.prototype.render = function (appender) {
        var self = this;

        this.container = $('<div/>');
        appender(this.container);

        var buttons = $('<span/>').addClass('buttons').appendTo(this.container);
        this.installButtons(buttons);
        this.tbody = $('<tbody/>');

        // The maximum width of the table, based on the viewport size
        var maxwidth = $(window).width() * 0.95

        // btable is the table that will contain the tbody; bdiv wraps
        // btable.
        this.btable = $('<table/>').css('table-layout', 'auto');
        var bdiv = $('<div/>').css({
            overflow: 'auto',
            'max-height': $(window).height() * 0.8,
            'max-width': maxwidth
        });
        this.container.append(bdiv.append(this.btable));

        // Construct the column headers
        var hrow = $('<tr/>');
        for (var i = 0; i < this.cols.length; i++) {
            hrow.append(this.makeColumnHeader(this.cols[i]));
        }

        this.thead = $('<thead/>').append(hrow);
        this.btable.append(this.thead).append(this.tbody);

        this.populateTBody();

        // Now that the browser has laid out the table, freeze the
        // column widths.
        var totalwidth = 0;
        hrow.children('th').each(function (i) {
            var th = $(this);
            var width = th.width();
            self.cols[i].width = width;
            totalwidth += width;
        });

        var tablecss = {
            'table-layout': 'fixed',
            'width': totalwidth
        };

        this.btable.css(tablecss);

        // Construct a separate table to contain the column headers
        // (so that the body table can be scrolled vertically while
        // the column headers remain visible).  hdiv contains this
        // table.  The padding right is a fudge to avoid an anomaly
        // when the table is scrolled to the extreme right.
        this.htable = $('<table/>').css(tablecss).css('padding-right', 100).append(this.thead);
        var hdiv = $('<div/>').css({
            overflow: 'hidden',
            'max-width': maxwidth
        }).append(this.htable).insertBefore(bdiv);

        function setWidths(elems) {
            elems.each(function (i) {
                $(this).css('width', self.cols[i].width);
            });
        }

        setWidths(this.thead.children('tr').children('th'));
        setWidths(this.tbody.children('tr:first').children('td'));

        // Lock the scrolling of the header table to the body table.
        bdiv.scroll(function () {
            hdiv.scrollLeft(bdiv.scrollLeft());
        });
    };

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


$(function() {
    var repl = $('#repl');
    var current;
    var eval_uri = "/eval";

    var spin = $('<img/>').attr('src', 'ajax-loader.gif');
    var form = $('<form/>').addClass('prompt')
        .append('<label/>')
        .append('<input/>');

    function catastrophe(error) {
        console.error(error);
        $('#errors').append($('<h3/>').addClass('fatal').text(error));
    }

    function prompt() {
        current = form.clone();
        current.submit(evaluate);
        repl.append(current);
        current.find('input').focus();
        return false;
    }

    function renderExpression(expr) {
        return $('<kbd/>').addClass('history').text(expr);
    }

    function fillOutputSection(output, response) {
        output.empty();

        if (response.hasOwnProperty('result')) {
            var res = Widget.widgetize(response.result);
            if (res !== undefined) {
                var resdiv = $('<div/>').addClass('result');
                output.append(resdiv);

                resdiv.append($('<var class="resultvar"/>')
                              .text(response.variable))
                       .append(' = ');

                Widget.renderInto(res, resdiv);
            }
        }
        else {
            output.append($('<span/>').text("Error: " + response.error));
        }
    }

    function evaluate() {
        var expr = current.find('input').val();
        current.replaceWith(renderExpression(expr));

        var output = $('<section/>').append(spin.clone());
        repl.append(output);

        sendToBeEvaluated(expr, function (result) {
            fillOutputSection(output, result);
        });

        return prompt();
    }

    var CONN;
    var SESSIONID;
    var KS = [];

    function fireK(m) {
        var k = KS.pop();
        k(JSON.parse(m.data));
    }

    function openSession(id) {
        if (CONN) {
            CONN.close();
            $(repl).empty();
        }
        CONN = new SockJS(eval_uri);
        CONN.onmessage = function(m) {
            SESSIONID = id;
            loadHistory(JSON.parse(m.data));
            CONN.onmessage = fireK;
            return prompt();
        };
        CONN.onopen = function() { CONN.send(id); };
        $('#sessions li a').removeClass('current');
        $('#sessions').find('li a[href="#' + id + '"]').addClass('current');
    }

    function sendToBeEvaluated(exp, k) {
        KS.push(k);
        CONN.send(exp);
    }

    function loadHistory(history) {
        for (var i = 0; i < history.length; i++) {
            repl.append(renderExpression(history[i].expr));
            var output = $('<section/>').appendTo(repl);
            if (history[i].in_progress)
                output.text('Hang on, still thinking about this one...');
            else
                fillOutputSection(output, history[i]);
        }
    }

    function maybeStartSession() {
        if (window.location.hash) {
            var sessionId = window.location.hash.substr(1);
            if (sessionId != SESSIONID) {
                openSession(sessionId);
            }
        }
    }

    window.addEventListener('popstate', maybeStartSession);

    maybeStartSession();
});
