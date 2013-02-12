// Special types, denoted in JSON by a '!' field

function decodeValue(json) {
    if (typeof(json) === 'object' && json) {
        if (json.hasOwnProperty('!')) {
            return decodeSpecial(json['!'], json);
        }
        return decodeObject(json);
    }
    return json;
}

var decodeObject = procedure('decodeObject');
decodeObject.method(Array, function(arr) {
    var len = arr.length;
    var vals = new Array(len);
    for (var i = 0; i < len; i++) {
        vals[i] = decodeValue(arr[i]);
    }
    return vals;
});
decodeObject.method(Object, function(obj) {
    var res = {};
    for (var k in obj) {
        if (obj.hasOwnProperty(k)) res[k] = decodeValue(obj[k]);
    }
    return res;
});

var decodeSpecial = procedure('decodeSpecial');
decodeSpecial.method('undefined', Object, function() {
    return undefined;
});
decodeSpecial.method('table', Object, function(_type, json) {
    return new Table(json.data, json.columns);
});

function Table(data, columns) {
    this.data = data.map(decodeValue);
    this.columns = columns;
}
