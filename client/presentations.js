// Widgets that display output values

var Presentation = (function(Widget) {

    var visualSize = procedure('visualSize');
    var widgetize = procedure('widgetize');

    var render = Widget.render;

    // A superclass and API
    function Presentation() {}
    Presentation.prototype = inheritFrom(Widget);

    Presentation.prototype.isCompact = function () {
        return !isNaN(this.size);
    };

    // API
    Presentation.widgetize = widgetize;

    // Sometimes this is called with just one argument; so we don't
    // have to specialise for each type twice, this transforms
    // undefined (not a subtype of Object) into null.
    widgetize.method(Object, undefined, function(val, _parent) {
        return widgetize(val, null);
    });

    function primitive(val, parent) { return val; }
    widgetize.method(String, Object, primitive);
    widgetize.method(Boolean, Object, primitive);
    widgetize.method(Number, Object, primitive);
    widgetize.method(null, Object, primitive);
    widgetize.method(undefined, Object, primitive);
    widgetize.method(undefined, undefined, primitive);

    // primitives are given as the value rather than a widget. Use this as a fallback.
    function renderPrimitive(val, appender, type) {
        appender($('<code/>').addClass(type || typeof(val)).text(String(val)));
    }

    render.method(Object, Function, renderPrimitive);
    render.method(null, Function, function(val, app) {
        return renderPrimitive('null', app, 'null');
    });
    render.method(String, Function, function(val, app) {
        return renderPrimitive('"' + val + '"', app);
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

    // Default behaviour to make it easy for subtypes
    visualSize.method(Presentation, function(w) {
        return w.size;
    });

    function ArrayWidget(arr, parent) {
        this.arr = arr;
        this.parent = parent;

        var size = 0;
        var separators = 0;

        for (var i = 0; i < arr.length; i++) {
            arr[i] = widgetize(arr[i], this);
            size += visualSize(arr[i]) + separators;
            separators = 2;
        }

        this.size = size + 2;
    }

    ArrayWidget.prototype = inheritFrom(Presentation);

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

    widgetize.method(Array, Object, function(array, parent) {
        return new ArrayWidget(array, parent);
    });

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
                obj[decoded] = widgetize(obj[k], this);
                delete obj[k];
                k = this.keys[i] = decoded;
            }
            else {
                obj[k] = widgetize(obj[k], this);
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

    ObjectWidget.prototype = inheritFrom(Presentation);

    render.method(ObjectWidget, Function, function (ow, appender) {
        appender('{');

        if (ow.isCompact()) {
            var sep = '';

            for (var i = 0; i < ow.keys.length; i++) {
                appender(sep);
                var k = ow.keys[i];
                appender(k);
                appender(': ');
                render(ow.obj[k], appender);
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

    widgetize.method(Object, Object, function(obj, parent) {
        return new ObjectWidget(obj, parent);
    });


    function TableWidget(val, parent) {
        this.cols = val.columns.map(function(name) { return {key: name}; });

        var data = val.data;

        for (var i = 0; i < data.length; i++)
            for (var k in data[i])
                data[i][k] = widgetize(data[i][k], this);

        this.rows = data;
    }

    TableWidget.prototype = inheritFrom(Presentation);

    render.method(TableWidget, Function, function (self, appender) {
        self.container = $('<div/>');
        appender(self.container);

        var buttons = $('<span/>').addClass('buttons').appendTo(self.container);
        self.installButtons(buttons);
        self.tbody = $('<tbody/>');

        // The maximum width of the table, based on the viewport size
        var maxwidth = $(window).width() * 0.95

        // btable is the table that will contain the tbody; bdiv wraps
        // btable.
        self.btable = $('<table/>').css('table-layout', 'auto');
        var bdiv = $('<div/>').css({
            overflow: 'auto',
            'max-height': $(window).height() * 0.8,
            'max-width': maxwidth
        });
        self.container.append(bdiv.append(self.btable));

        // Construct the column headers
        var hrow = $('<tr/>');
        for (var i = 0; i < self.cols.length; i++) {
            hrow.append(self.makeColumnHeader(self.cols[i]));
        }

        self.thead = $('<thead/>').append(hrow);
        self.btable.append(self.thead).append(self.tbody);

        self.populateTBody();

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

        self.btable.css(tablecss);

        // Construct a separate table to contain the column headers
        // (so that the body table can be scrolled vertically while
        // the column headers remain visible).  hdiv contains this
        // table.  The padding right is a fudge to avoid an anomaly
        // when the table is scrolled to the extreme right.
        self.htable = $('<table/>').css(tablecss).css('padding-right', 100).append(self.thead);
        var hdiv = $('<div/>').css({
            overflow: 'hidden',
            'max-width': maxwidth
        }).append(self.htable).insertBefore(bdiv);

        function setWidths(elems) {
            elems.each(function (i) {
                $(this).css('width', self.cols[i].width);
            });
        }

        setWidths(self.thead.children('tr').children('th'));
        setWidths(self.tbody.children('tr:first').children('td'));

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


    widgetize.method(Table, Object, function(table, parent) {
        return new TableWidget(table, parent);
    });

    return Presentation;
})(Widget);
