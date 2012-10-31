'use strict';

var noodle = require('noodle');
var when = require('when');

// Tablize a value, returning a stream with the columns given.
function table(something, columnsInOrder) {
    function streamize(val) {
        if (typeof(val) === 'object') {
            if (when.isPromise(val)) {
                return noodle.asPromised(when(val, streamize));
            }
            else if (isTable(val)) {
                return val.stream;
            }
            else if (Array.isArray(val)) {
                return noodle.array(val);
            }
            else {
                // Turn other objects into a key/value table
                var arr = [];
                for (var p in val)
                    arr.push({key: p, value: val[p]});
                return noodle.array(arr);
            }
        }
        else {
            // Make singleton values into a single-celled table
            return noodle.array([{value: val}]);
        }
    }

    return new Table(streamize(something), columnsInOrder);
}

function Table(stream, columns) {
    this.stream = stream;
    this.columns = columns;
}

function inferColumns(data) {
    // Find the set of keys from the data elements
    var keys = {};
    for (var i = 0; i < data.length; i++) {
        for (var k in data[i]) {
            keys[k] = true;
        }
    }

    // Turn that set into a sorted list
    var cols = [];
    for (var k in keys) {
        cols.push(k);
    }
    cols.sort();
    return cols;
}

Table.prototype.serialize = function () {
    var cols = this.columns;
    var stream = this.stream;
    if (cols)
        stream = stream.project(cols);

    return when(stream.collect(), function(data) {
        if (cols === undefined) {
            cols = inferColumns(data);
        }
        return {
            rows: data,
            columns: cols
        };
    });
};

Table.deserialize = function (json) {
    return new Table(noodle.array(json.rows), json.columns);
};

function isTable(value) {
    return value instanceof Table;
}

module.exports.table = table;
module.exports.isTable = isTable;
