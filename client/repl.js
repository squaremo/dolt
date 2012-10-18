var TableControl = (function() {
    function sortedKeys(a) {
        var keys = {};

        for (var i = 0; i < a.length; i++) {
            for (var k in a[i]) {
                keys[k] = true;
            }
        }

        var sorted = [];

        for (var k in keys) {
            sorted.push(k);
        }

        sorted.sort();
        return sorted;
    }

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
        this.keys = sortedKeys(data);
        this.rows = data;
    }

    View.prototype.install = function (container) {
        this.tbody = $('<tbody/>');
        this.colheaders = {};

        // The maximum width of the table, based on the viewport size
        var maxwidth = $(window).width() * 0.95

        // btable is the table that will contain the tbody; bdiv wraps
        // btable.
        var btable = $('<table/>').css('table-layout', 'auto');
        var bdiv = $('<div/>').css({
            overflow: 'auto',
            'max-height': $(window).height() * 0.8,
            'max-width': maxwidth
        });

        container.empty().append(bdiv.append(btable));

        // Construct the column headers
        var hrow = $('<tr/>');
        for (var i = 0; i < this.keys.length; i++) {
            hrow.append(this.makeColHeader(this.keys[i]));
        }

        var thead = $('<thead/>').append(hrow);
        btable.append(thead).append(this.tbody);

        this.populateTBody();

        // Now that the browser has laid out the table, freeze the
        // column widths.
        var colwidths = this.colwidths = [];
        var totalwidth = 0;
        hrow.children('th').each(function () {
            var th = $(this);
            var width = th.width();
            colwidths.push(width);
            totalwidth += width;
        });

        var tablecss = {
            'table-layout': 'fixed',
            'width': totalwidth
        };

        btable.css(tablecss);

        // Construct a separate table to contain the column headers
        // (so that the body table can be scrolled vertically while
        // the column headers remain visible).  hdiv contains this
        // table.  The padding right is a fudge to avoid an anomaly
        // when the table is scrolled to the extreme right.
        var htable = $('<table/>').css(tablecss).css('padding-right', 100).append(thead);
        var hdiv = $('<div/>').css({
            overflow: 'hidden',
            'max-width': maxwidth
        }).append(htable).insertBefore(bdiv);

        hrow.children('th').each(function (i) {
            $(this).css('width', colwidths[i]);
        });

        btable.children('tbody').children('tr:first').children('td').each(function (i) {
            $(this).css('width', colwidths[i]);
        });

        // Lock the scrolling of the header table to the body table.
        bdiv.scroll(function () {
            hdiv.scrollLeft(bdiv.scrollLeft());
        });
    }

    View.prototype.sortOn = function (key) {
        var descending = (this.sortedby === key && !this.sortdescending);
        this.rows = sortByKey(this.rows, key, descending);

        if (this.sortedby !== undefined) {
            this.colheaders[this.sortedby].removeClass('ascending descending');
        }

        this.sortedby = key;
        this.sortdescending = descending;
        this.colheaders[this.sortedby].addClass(
                                       descending ? 'descending' : 'ascending');

        this.populateTBody();
    };

    View.prototype.makeColHeader = function (key) {
        var view = this;
        return view.colheaders[key] = $('<th>').text(key).click(function() {
            view.sortOn(key);
        });
    };

    View.prototype.populateTBody = function () {
        var tbody = this.tbody;
        tbody.empty();

        var colwidths = this.colwidths;
        for (var i = 0; i < this.rows.length; i++) {
            var row = $('<tr/>');
            for (var j = 0; j < this.keys.length; j++) {
                var val = this.rows[i][this.keys[j]];
                var td =$('<td>').text(JSON.stringify(val));
                if (colwidths) { td.css('width', colwidths[j]); }
                row.append(td);
            }

            tbody.append(row);

            // We only need to add width properties on the first row
            colwidths = null;
        }
    };

    return {
        install: function (containers, data) {
            containers.each(function () {
                new View(data).install($(this));
            });
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
        install: function (containers, data) {
            containers.empty().append(printValue(data));
        }
    };
})();

var ResultControl = {
    install: function (containers, symbol, data) {
        containers.each(function () {
            var container = $(this);
            var valdiv = $('<div class="resultval"/>');

            function showTree() {
                TreeControl.install(valdiv, data);
                container.removeClass('tableview').addClass('treeview');
                return false;
            }

            function showTable() {
                TableControl.install(valdiv, data);
                container.removeClass('treeview').addClass('tableview');
                return false;
            }

            container.empty()
                .append($('<var/>').addClass('resultvar').text(symbol))
                .append($('<a href="#" class="treebtn">tree</a>').click(showTree))
                .append($('<a href="#" class="tablebtn">table</a>').click(showTable))
                .append(valdiv);

            showTree();
        });
    }
};

$(function() {
    var repl = $('#repl');
    var current;
    var eval_uri;

    var spin = $('<img/>').attr('src', 'ajax-loader.gif');
    var form = $('<form/>').addClass('prompt')
        .append('<label/>')
        .append('<input/>');

    function catastrophe(error) {
        console.error(error);
        $('#errors').append($('<h3/>').addClass('fatal').text(error));
    }

    $.post('/api/session', function(data) {
        eval_uri = data.eval_uri;
        prompt();
    }, 'json');

    function prompt() {
        current = form.clone();
        current.submit(evaluate);
        repl.append(current);
        current.find('input').focus();
        return false;
    }

    function evaluate() {
        var expression = current.find('input').val();
        current.replaceWith($('<kbd/>').addClass('history')
                            .append('<code/>').text(expression));

        var output = $('<section/>').append(spin.clone());
        repl.append(output);

        sendToBeEvaluated(expression, function (result) {
            output.empty();

            if (result.hasOwnProperty('value')) {
                var resdiv = $('<div/>').addClass('result');
                output.append(resdiv);
                ResultControl.install(resdiv, result.variable, result.value);
            }
            else {
                output.append($('<span/>').text("Error: " + result.error));
            }
        });

        return prompt();
    }

    function sendToBeEvaluated(exp, k) {
        $.post(eval_uri, exp, k, 'json');
    }
});
