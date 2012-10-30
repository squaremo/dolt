var TableControl = (function() {

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

    function View(data) {
        this.cols = data.columns.map(function(name) { return {key: name}; });
        this.rows = data.rows;
    }

    View.prototype.install = function (container) {
        var view = this;
        this.container = container.empty();
        var buttons = $('<span/>').addClass('buttons').appendTo(container);
        view.installButtons(buttons);
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
        container.append(bdiv.append(this.btable));

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
            view.cols[i].width = width;
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
                $(this).css('width', view.cols[i].width);
            });
        }

        setWidths(this.thead.children('tr').children('th'));
        setWidths(this.tbody.children('tr:first').children('td'));

        // Lock the scrolling of the header table to the body table.
        bdiv.scroll(function () {
            hdiv.scrollLeft(bdiv.scrollLeft());
        });
    }

    View.prototype.sortOn = function (col) {
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

    View.prototype.setSortIndicator = function (col) {
        this.sortedby.header.addClass(this.sortdescending ? 'descending'
                                                          : 'ascending');
    };

    View.prototype.makeColumnHeader = function (col) {
        var view = this;
        col.header = $('<th>').text(col.key).click(function() {
            view.sortOn(col);
        });
        if (col.width) { col.header.css('width', col.width); }
        if (this.sortedby === col) { this.setSortIndicator(); }
        return col.header;
    };

    View.prototype.makeCell = function (col, row) {
        var val = this.rows[row][col.key];
        var td = $('<td>');
        TreeControl.install(td, val);
        // We only need to add width properties on the first row
        if (!row && col.width) { td.css('width', col.width); }
        return td;
    };

    View.prototype.populateTBody = function () {
        var tbody = this.tbody;
        tbody.empty();

        var colwidths = this.colwidths;
        for (var i = 0; i < this.rows.length; i++) {
            var row = $('<tr/>');
            for (var j = 0; j < this.cols.length; j++) {
                var col = this.cols[j];
                if (col.header) { row.append(this.makeCell(col, i)); }
            }

            tbody.append(row);
        }
    };

    View.prototype.selectColumns = function () {
        var columnsform = $('<form/>');
        this.container.prepend(columnsform);

        for (var i = 0; i < this.cols.length; i++) {
            var col = this.cols[i];
            columnsform.append($('<label/>')
                                   .append(this.columnShownCheckbox(col))
                                   .append(' ' + col.key + ' '));
        }

        columnsform.append('<input type="submit" value="Done"/>');

        var view = this;
        columnsform.submit(function () {
            columnsform.remove();
            view.columnsbutton.css('display', 'inline');
            return false;
        });
    };

    View.prototype.columnShownCheckbox = function (col) {
        var view = this;
        var checkbox = $('<input type="checkbox"/>');
        if (col.header) { checkbox.attr("checked", "checked"); }
        checkbox.change(function () {
            var show = !!checkbox.attr("checked");
            if (show) {
                view.showColumn(col);
            }
            else {
                view.unshowColumn(col);
            }
            view.recalcTotalWidth();
        });
        return checkbox;
    };

    View.prototype.unshowColumn = function (col) {
        var index = this.shownColumnIndex(col);
        col.header.remove();
        col.header = null;
        this.tbody.children('tr').each(function () {
            $(this).children().eq(index).remove();
        });
    };

    View.prototype.showColumn = function (col) {
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

        var view = this;
        this.thead.children('tr').each(function () {
            insert(this, view.makeColumnHeader(col));
        });
        this.tbody.children('tr').each(function (i) {
            insert(this, view.makeCell(col, i));
        });
    };

    // Return the number of shown columns before the given column
    View.prototype.shownColumnIndex = function (col) {
        var res = 0;
        for (var i = 0; i < this.cols.length; i++) {
            if (this.cols[i] === col) { return res; }
            if (this.cols[i].header) { res++; }
        }
        throw "couldn't find column";
    };

    View.prototype.recalcTotalWidth = function () {
        var totalwidth = 0;
        for (var i = 0; i < this.cols.length; i++) {
            if (this.cols[i].header) {
                totalwidth += this.cols[i].width;
            }
        }

        this.btable.css('width', totalwidth);
        this.htable.css('width', totalwidth);
    }

    View.prototype.installButtons = function (buttons) {
        var view = this;
        this.columnsbutton = $('<a href="#" class="button"/>')
            .text('select columns')
            .click(function () {
                view.columnsbutton.css('display', 'none');
                view.selectColumns();
            });
        buttons.append(this.columnsbutton);
    };

    return {
        install: function (container, data) {
            var view = new View(data);
            view.install(container);
        }
    };
})();

var TreeControl = (function () {
    function printValue(value) {
        var t = typeof value;
        switch (t) {
        case 'date':
            return $('<code/>')
                .append($('<time/>').addClass(t).text(String(value)));
        case 'object':
            if (value === null) {
                t = 'null';
                break;
            }
            else {
                return printComposite(
                    value, (Array.isArray(value)) ? 'array' : 'object');
            }
        case 'function':
            value = '[Function]';
            break;
        }

        return $('<code/>').addClass(t).text(String(value));
    }

    function printComposite(obj, t) {
        return ((isCompact(obj)) ? printCompact(obj, t) : printFull(obj, t)).addClass('composite');
    }

    // totally ad-hoc. Other methods: items are ground types and there
    // are fewer than x (trickier for objects than arrays, since keys
    // can be long ..); only do this for arrays; etc.
    function isCompact(obj) {
        return JSON.stringify(obj).length < 30;
    }

    function printCompact(obj, t) {
        var outer = $((t === 'array') ? '<ol/>' : '<ul/>').addClass(t);
        for (var k in obj) {
            outer.append($('<li/>').addClass('item')
                         .append($('<span/>').addClass('key')
                                   .text(JSON.stringify(k)),
                                 $('<span/>').addClass('value')
                                   .append(printValue(obj[k]))))
        }
        return outer;
    }

    function printFull(obj, t) {
        var outer = $('<table/>').addClass(t);
        for (var k in obj) {
            outer.append($('<tr/>').addClass('item')
                         .append($('<td/>') .addClass('key')
                                   .text(JSON.stringify(k)),
                                 $('<td/>').addClass('value')
                                   .append(printValue(obj[k]))))
        }
        return outer;
    }

    function printArray(arr) {
        return printObject(arr, 'array');
    }

    return {
        install: function (container, data) {
            container.empty().append(printValue(data));
        }
    };
})();

var ResultControl = {
    install: function (container, view, symbol, data) {
        var valdiv = $('<div class="resultval"/>');

        container.empty()
            .append($('<var/>').addClass('resultvar').text(symbol))
            .append(valdiv);

        view.install(valdiv, data);
    }
};

$(function() {
    var repl = $('#repl');
    var current;
    var eval_uri = "/api/eval";

    var CONTROLS = {
        'table': TableControl,
        'ground': TreeControl
    };

    function viewFor(result) {
        return CONTROLS[result.type];
    }

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
            var result = response.result;
            var resdiv = $('<div/>').addClass('result');
            output.append(resdiv);
            var view = viewFor(result);
            ResultControl.install(resdiv, view, response.variable, result.value);
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

    function sendToBeEvaluated(exp, k) {
        $.post(eval_uri, exp, k, 'json');
    }

    $.get('/api/history', function(history) {
        for (var i = 0; i < history.length; i++) {
            repl.append(renderExpression(history[i].expr));
            var output = $('<section/>').appendTo(repl);
            if (history[i].in_progress)
                output.text('Hang on, still thinking about this one...');
            else
                fillOutputSection(output, history[i]);
        }

        prompt();
    }, 'json');
});
