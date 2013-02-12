function Model(initial) {
    this.value = initial;
    this.listeners = [];
}

(function(M) {
    M.observe = function(kind, fn) {
        this.listeners.push({kind: kind, fn: fn});
    };

    M.unobserve = function() {
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

    M.fire = function(kind, event) {
        for (var i = 0; i < this.listeners.length; i ++) {
            var listener = this.listeners[i];
            if (kind === listener.kind || listener.kind === '*')
                listener.fn(event, kind);
        }
    };

    // Get the 'whole' value at once
    M.get = function() {
        return this.value;
    };
    // Set the whole value at once
    M.set = function(value) {
        this.value = value;
        this.fire('change', value);
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
        this.fire('updated', index);
    };

    C.remove = function(index) {
        delete this.value[index];
        this.fire('removed', index);
    };

    C.insert = function(index, entry) {
        this.value.splice(index, 1, entry);
        this.fire('inserted', index);
    };

    C.entries = function() {
        return this.value; // %% mutation
    };

    C.at = function(index) {
        return this.value[index];
    };

})(CollectionModel.prototype);
