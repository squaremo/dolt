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
    // Handshake by passing the Session ID; expect (below) the history
    // in return
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
    var entry = {
        expr: expr,
        kind: kind,
        result: new Waiting()
    };
    this.update(index, entry);
    this.session.send(JSON.stringify({expr: expr, index: index}));
};

function NotebookView(container) {
    this.container = container;
    this.entries = [];
}

NotebookView.prototype = inheritFrom(Widget);

NotebookView.prototype.repaint = function() {
    var lines = $('<table/>').addClass('entries');;
    renderInto(this, lines);
    this.container.empty();
    this.container.append(lines);
};

NotebookView.prototype.handleText = function(text) {
    console.log({text: text});
};

render.method(NotebookView, Function, function(view, append) {
    view.entries.forEach(function(entry) {
        var line = $('<tr/>');
        var margin = $('<td/>').addClass('binding');
        if (entry.variable) {
            margin.append($('<var/>').text(entry.variable));
        }
        line.append(margin);

        var entryContainer = $('<td/>').addClass('entry');
        var entryWidget = new EvalWidget(entry);
        renderInto(entryWidget, entryContainer);
        line.append(entryContainer);
        append(line);
    });
    var box = $('<input/>');
    var input = $('<form/>').append(box);
    input.submit(function() {
        view.handleText(box.val());
        return false;
    });

    var promptLine = $('<tr/>');
    promptLine.append($('<td/>').addClass('prompt')
                      .append($('<label/>').text('>')));
    promptLine.append($('<td/>').addClass('gettext')
                      .append(input));
    append(promptLine);
});

function EvalWidget(entry) {
    this.entry = entry;
}
EvalWidget.prototype = inheritFrom(Widget);

render.method(EvalWidget, Function, function(w, append) {
    var expr = new ExpressionWidget(w.entry.expr);
    var result;
    if (w.entry.error) {
        result = widgetize(new Error(w.entry.error));
    }
    else {
        result = widgetize(w.entry.result);
    }
    var input = $('<kbd/>').addClass('expr');
    renderInto(expr, input);
    var output = $('<code/>').addClass('result');
    if (result !== undefined) renderInto(result, output);
    append(input); append(output);
});

$(function() {
    var nb = new NotebookModel('/eval');
    var nv = new NotebookView($('#repl'));

    nb.observe('*', function() {
        console.log({entries: nb.get()});
        nv.entries = nb.get();
        nv.repaint();
    });
    nv.handleText = function(expr) {
        nb.addEntry(expr, 'eval');
    };

    function selectSession(id) {
        $('#sessions a').removeClass('current');
        $('#sessions').find('a[href="#' + id + '"]').addClass('current');
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
