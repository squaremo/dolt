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

function columnUnion(colsA, colsB) {
    if (Array.isArray(colsA) && Array.isArray(colsB)) {
        var set = {};
        var add = function(k) { set[k] = true; };
        colsA.forEach(add); colsB.forEach(add);
        var res = [];
        for (var k in set) res.push(k);
        return res;
    }
    // If we don't have the explicit columns supplied, we have to go
    // back to guessing.
    else {
        return;
    }
}

function renameColumns(cols, map) {
    if (cols) {
        return cols.map(function(k) {
            return (k in map) ? map[k] : k;
        });
    }
    else return cols;
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

Table.prototype.restrict = function(objOrFn) {
    switch (typeof objOrFn) {
    case 'function':
        return new Table(this.stream.filter(objOrFn), this.columns);
    case 'object':
        var p = function(val) {
            for (var k in objOrFn) {
                // %% treatment of undefined/null
                if (objOrFn[k] != val[k]) return false;
            }
            return true;
        };
        return this.restrict(p);
    default:
        return this.restrict({value: objOrFn});
    }
};

Table.prototype.join = function(tableB, cols) {
    return new Table(this.stream.equijoin(cols, tableB.stream), // NB arg order
                     columnUnion(this.columns, tableB.columns));
}

Table.prototype.rename = function(map) {
    var renamer, newCols;
    if (typeof map === 'object') {
        renamer = function(obj) {
            var out = {};
            for (var k in obj) {
                if (k in map)
                    out[map[k]] = obj[k];
                else
                    out[k] = obj[k];
            }
            return out;
        };
        newCols = renameColumns(this.columns, map);
    }
    else {
        var prefix = map + '.';
        renamer = function(obj) {
            var out = {};
            for (var k in obj) {
                out[prefix + k] = obj[k];
            }
            return out;
        }
        newCols = this.columns && this.columns.map(
            function(k) { return prefix + k; });
    }
    return new Table(this.stream.map(renamer), newCols);
};

Table.deserialize = function (json) {
    return new Table(noodle.array(json.rows), json.columns);
};

function isTable(value) {
    return value instanceof Table;
}

module.exports = Table;
module.exports.table = table;
module.exports.isTable = isTable;
