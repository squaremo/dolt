// dependencies

// require('SockJS')
// require('widgets')
// require('presentations')
// require('types')
// require('models')

// imports
var renderInto = Widget.renderInto;
var render = Widget.render;
var widgetize = Presentation.widgetize;

// custom objects

function NotebookModel(url) {
    CollectionModel.call(this);
    this.url = url;
}
NotebookModel.prototype = inheritFrom(CollectionModel);

NotebookModel.prototype.connectToSession = function(sessionId) {
    this.sessionId = sessionId;
    if (this.session) this.session.close();
    var s = this.session = new SockJS(this.url);
    var self = this;
    // Handshake by passing the Session ID; expect the history in
    // return
    s.onopen = function() { s.send(self.sessionId); };
    s.onmessage = function(m) {
        s.onmessage = function(m) {
            self._handle(JSON.parse(m.data));
        };
        self.set(JSON.parse(m.data));
    };
};

NotebookModel.prototype._handle = function(msg) {
    var index = msg.index;
    var response = msg.entry;
    var entry = this.at(index);
    entry.result = decodeValue(response.result);
    entry.error = response.error;
    entry.variable = response.variable;
    this.update(index, entry);
};

widgetize.method(Error, Object, function(err) {
    return err;
});
render.method(Error, Function, function(err, append) {
    append($('<span/>').addClass('error').text(err));
});

// A special value to represent values we're waiting for
function Waiting() {}
widgetize.method(Waiting, Object, function(wait) {
    return wait;
});
render.method(Waiting, Function, function(_, append) {
    append($('<img/>').attr('src', 'ajax-loader.gif'));
});
// (only required if I want to return these from the server for some
// reason)
// decodeSpecial.method('waiting', Object, function() {
//     return new Waiting();
// });

NotebookModel.prototype.addEntry = function(expr, kind) {
    var index = this.get().length;
    this.setEntry(index, expr, kind);
};

NotebookModel.prototype.setEntry = function(index, expr, kind) {
    var entry = {
        expr: expr,
        kind: kind,
        result: new Waiting()
    };
    this.update(index, entry);
    this.session.send(JSON.stringify({expr: expr, index: index}));
};

function NotebookView(container) {
    Widget.call(this);
    this.container = container;
    this.children = [];
}
NotebookView.prototype = inheritFrom(Widget);

// Paint everything from scratch
NotebookView.prototype.paint = function(entries) {
    this.children = new Array(entries.length);
    var self = this;
    entries.forEach(function(entry, index) {
        self.createChild(entry, index);
    });
    var lines = $('<table/>').addClass('entries');
    renderInto(this, lines);
    this.container.empty();
    this.container.append(lines);
};

NotebookView.prototype.updateChild = function(entry, index) {
    var child = this.children[index];
    if (child) {
        child.widget.update(entry);
        // In lieu of a proper model / whatever
        if (entry.variable) child.margin.text(entry.variable);
    }
    else {
        var child = this.createChild(entry, index);
        // %% bit of a cheat
        this.container.find('.last').before(child.row);
    }
};

NotebookView.prototype.createChild = function(entry, index) {
    var widget = new EvalWidget(entry);
    var self = this;

    widget.observe('click', function() { widget.edit(); });
    widget.observe('submit', function(expr) {
        self.fire('updateEntry', {index: index, expr: expr});
        widget.display();
    });

    var row = $('<tr/>');
    var margin = $('<td/>').addClass('binding');
    if (entry.variable) {
        margin.append($('<var/>').text(entry.variable));
    }
    row.append(margin);
    var container = $('<td/>').addClass('entry');
    renderInto(widget, container);
    row.append(container);

    widget.observe('needRepaint', function() {
        container.empty();
        renderInto(widget, container);
    });

    var child = {
        widget: widget,
        container: container,
        margin: margin,
        row: row
    };
    this.children[index] = child;
    return child;
};

render.method(NotebookView, Function, function(view, append) {
    view.children.forEach(function(child) {
        append(child.row);
    });

    var box = $('<input/>').addClass('gettext');
    var input = $('<form/>').append(box);
    input.submit(function() {
        view.fire('submit', box.val());
        box.val('');
        return false;
    });

    var promptLine = $('<tr/>').addClass('last');
    promptLine.append($('<td/>').addClass('prompt')
                      .append($('<label/>').text('>')));
    promptLine.append($('<td/>').append(input));
    append(promptLine);
});

function EvalWidget(entry) {
    Widget.call(this);
    this.entry = entry;
    this.editing = false;
}
EvalWidget.prototype = inheritFrom(Widget);

render.method(EvalWidget, Function, function(w, append) {
    var result;
    if (w.entry.error) {
        result = widgetize(new Error(w.entry.error));
    }
    else {
        result = widgetize(w.entry.result);
    }

    var input;
    if (w.editing) {
        var text = $('<input/>').addClass('gettext').val(w.entry.expr);
        input = $('<form/>').append(text);
        input.submit(function() { w.fire('submit', text.val()); return false; });
    }
    else {
        input = $('<kbd/>').addClass('expr');
        // %% inline controller
        var expr = new ExpressionWidget(w.entry.expr);
        renderInto(expr, input);
        input.click(function() { w.fire('click'); });
    }
    var output = $('<code/>').addClass('result');
    if (result !== undefined) renderInto(result, output);
    append(input); append(output);
});

EvalWidget.prototype.edit = function() {
    if (!this.editing) {
        this.editing = true;
        this.fire('needRepaint');
    }
};

EvalWidget.prototype.display = function() {
    if (this.editing) {
        this.editing = false;
        this.fire('needRepaint');
    }
};

// %% Ought this use the Observer protocol? (and if so, can it be
// %% factored out)
EvalWidget.prototype.update = function(entry) {
    this.entry = entry;
    this.fire('needRepaint');
};

$(function() {
    var nb = new NotebookModel('/eval');
    var nv = new NotebookView($('#repl'));

    nb.observe('changed', function() {
        var entries = nb.get();
        nv.paint(entries);
    });
    nb.observe('elementChanged', function(index) {
        var entry = nb.at(index);
        nv.updateChild(entry, index);
    });

    nv.observe('submit', function(expr) {
        nb.addEntry(expr, 'eval');
    });
    nv.observe('updateEntry', function(event) {
        nb.setEntry(event.index, event.expr, 'eval');
    });

    function selectSession(id) {
        $('#session').text(id);
    }

    function maybeStartSession() {
        if (window.location.hash) {
            var sessionId = window.location.hash.substr(1);
            if (nb.sessionId != sessionId) {
                nb.connectToSession(sessionId);
                selectSession(sessionId);
            }
        }
    }
    
    window.addEventListener('popstate', maybeStartSession);
    
    maybeStartSession();
});
