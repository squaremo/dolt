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

    function Model(data) {
        this.keys = sortedKeys(data);
        this.rows = data;
    }

    Model.prototype.rotate = function () {
        this.rows.push(this.rows.shift());
    };

    Model.prototype.sortByKey = function (key, descending) {
        var i = 0;
        var enumrows = this.rows.map(function (row) {
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

        this.rows = enumrows.map(function (er) { return er.row; });
    };

    function View(model) {
        this.model = model;
        this.table = $('<table/>');
        this.tbody = $('<tbody/>');
        this.colheaders = {};

        var hrow = $('<tr/>');
        for (var i = 0; i < model.keys.length; i++) {
            hrow.append(this.makeColHeader(model.keys[i]));
        }

        this.table.append($('<thead/>').append(hrow)).append(this.tbody);

        this.populateTBody();
    }

    View.prototype.sortOn = function (key) {
        var descending = (this.sortedby === key && !this.sortdescending);
        this.model.sortByKey(key, descending);

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

        var model = this.model;
        model.rows.forEach(function (mrow) {
            var row = $('<tr/>');
            model.keys.forEach(function (key) {
                row.append($('<td>').text(JSON.stringify(mrow[key])));
            });

            tbody.append(row);
        });
    };

    return {
        install: function (containers, data) {
            containers.each(function () {
                $(this).empty().append(new View(new Model(data)).table);
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
