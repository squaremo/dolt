$(function() {
    var repl = $('#repl');
    var eval_uri = "/eval";

    var spin = $('<img/>').attr('src', 'ajax-loader.gif');

    function Entry(record) {
        this.input = $('<section/>');
        this.output = $('<section/>');        
        this.node = $('<section/>').addClass('entry')
            .append(this.input)
            .append(this.output);
        this.expr = '';

        this.blur = function() {
            if (this.cursor) this.expr = this.cursor.val();
            var pretty = renderExpression(this.expr);
            this.input.empty();
            this.input.append(pretty);
            this.cursor = null;
        };

        this.focus = function() {
            var cursor = this.cursor = $('<input/>');
            cursor.val(this.expr);

            var form = $('<form/>').addClass('prompt')
                .append('<label/>')
                .append(cursor);
            
            var self = this;

            function evaluate() {
                self.blur();
                var waiting = spin.clone();
                self.output.append(waiting);

                var toEval = {expr: self.expr};
                if (self.variable) { toEval.variable = self.variable; }

                sendToBeEvaluated(toEval, function (result) {
                    fillOutputSection(self.output, result);
                    self.variable = result.variable;
                });
                return false;
            }
            
            form.submit(evaluate);
            this.input.empty();
            this.input.append(form);
            cursor.focus();
        };

        if (record) {
            if (record.in_progress)
                this.output.text('Hang on, still thinking about this one...');
            else
                fillOutputSection(this.output, record);
            this.expr = record.expr;
            this.variable = record.variable;
            this.blur();
        }
    }
    
    function catastrophe(error) {
        console.error(error);
        $('#errors').append($('<h3/>').addClass('fatal').text(error));
    }

    function renderExpression(expr) {
        return $('<kbd/>').addClass('history').append(hilite(expr));
    }

    function hilite(expr) {
        try {
            var ast = Parser.parse(expr);
            return unparseAsHTML(ast);
        } catch (e) {
            return $('<span/>').addClass('syntax-error').text(expr);
        }
    }

    function fillOutputSection(output, response) {
        output.empty();

        if (response.hasOwnProperty('result')) {
            var res = Widget.widgetize(response.result);
            if (res !== undefined) {
                var resdiv = $('<div/>').addClass('result');
                output.append(resdiv);

                resdiv.append($('<var class="resultvar"/>')
                              .text(response.variable))
                       .append(' = ');

                Widget.renderInto(res, resdiv);
            }
        }
        else {
            output.append($('<span/>').text("Error: " + response.error));
        }
    }

    var HISTORY = [];
    var current;

    function appendEntry(item) {
        var entry = new Entry(item);
        var num = HISTORY.length;
        entry.input.click(function() {
            if (current !== undefined) HISTORY[current].blur();
            current = num;
            HISTORY[num].focus();
        });
        HISTORY.push(entry);
        repl.append(entry.node);
        return entry;
    }

    function prompt() {
        var next = appendEntry();
        next.focus();
        current = HISTORY.length - 1;
        return false;
    }

    var CONN;
    var SESSIONID;
    var KS = [];

    function fireK(m) {
        var k = KS.pop();
        k(JSON.parse(m.data));
    }

    function openSession(id) {
        if (CONN) {
            CONN.close();
            $(repl).empty();
        }
        CONN = new SockJS(eval_uri);
        CONN.onmessage = function(m) {
            SESSIONID = id;
            loadHistory(JSON.parse(m.data));
            CONN.onmessage = fireK;
            return prompt();
        };
        CONN.onopen = function() { CONN.send(id); };
        $('#sessions a').removeClass('current');
        $('#sessions').find('a[href="#' + id + '"]').addClass('current');
    }

    function sendToBeEvaluated(exp, k) {
        KS.push(k);
        CONN.send(JSON.stringify(exp));
        if (current === HISTORY.length - 1) {
            prompt();
        }
    }

    function loadHistory(history) {
        for (var i = 0; i < history.length; i++) {
            appendEntry(history[i]);
        }
    }

    function maybeStartSession() {
        if (window.location.hash) {
            var sessionId = window.location.hash.substr(1);
            if (sessionId != SESSIONID) {
                openSession(sessionId);
            }
        }
    }

    window.addEventListener('popstate', maybeStartSession);

    maybeStartSession();
});
