// This is the same as the conventional
// `Sub.prototype = new Super();`
// except that it avoids running Super (but that can of course be done
// in Sub if desired).
function inheritFrom(parentConstructor) {
    function constr() {}
    constr.prototype = parentConstructor.prototype;
    return new constr();
}


function Observable() {
    this.listeners = [];
}

(function(O) {
    O.observe = function(kind, fn) {
        this.listeners.push({kind: kind, fn: fn});
    };

    O.unobserve = function() {
        var kind, fn;
        if (arguments.length === 1) {
            kind === true;
        }
        else {
            kind = arguments[0];
            fn = arguments[1];
        }
        for (var i = 0; i < this.listeners.length; i ++) {
            var listener = this.listeners[i];
            if (fn === listener.fn &&
                (kind === '*' || kind === listener.kind))
                return (delete listener[i]);
        }
    };

    O.fire = function(kind, event) {
        for (var i = 0; i < this.listeners.length; i ++) {
            var listener = this.listeners[i];
            if (kind === listener.kind || listener.kind === '*')
                listener.fn(event, kind);
        }
    };
})(Observable.prototype);

function Model(initial) {
    Observable.call(this);
    this.value = initial;
}
Model.prototype = inheritFrom(Observable);

(function(M) {
    // Get the 'whole' value at once
    M.get = function() {
        return this.value;
    };
    // Set the whole value at once
    M.set = function(value) {
        this.value = value;
        this.fire('changed', value);
    };

})(Model.prototype);


function CollectionModel() {
    Model.call(this, []);
}
CollectionModel.prototype = inheritFrom(Model);

(function(C) {
    // %% Do I need all these?

    C.update = function(index, entry) {
        this.value[index] = entry;
        this.fire('elementChanged', index);
    };

    C.remove = function(index) {
        delete this.value[index];
        this.fire('elementRemoved', index);
    };

    C.insert = function(index, entry) {
        this.value.splice(index, 1, entry);
        this.fire('elementInserted', index);
    };

    C.entries = function() {
        return this.value; // %% mutation
    };

    C.at = function(index) {
        return this.value[index];
    };

})(CollectionModel.prototype);
