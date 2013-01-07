$(function() {
    var repl = $('#repl');
    var current;
    var eval_uri = "/eval";

    var spin = $('<img/>').attr('src', 'ajax-loader.gif');
    var form = $('<form/>').addClass('prompt')
        .append('<label/>')
        .append('<input/>');

    function catastrophe(error) {
        console.error(error);
        $('#errors').append($('<h3/>').addClass('fatal').text(error));
    }

    function prompt() {
        current = form.clone();
        current.submit(evaluate);
        repl.append(current);
        current.find('input').focus();
        return false;
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

    function evaluate() {
        var expr = current.find('input').val();
        current.replaceWith(renderExpression(expr));

        var output = $('<section/>').append(spin.clone());
        repl.append(output);

        sendToBeEvaluated(expr, function (result) {
            fillOutputSection(output, result);
        });

        return prompt();
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
        CONN.send(exp);
    }

    function loadHistory(history) {
        for (var i = 0; i < history.length; i++) {
            repl.append(renderExpression(history[i].expr));
            var output = $('<section/>').appendTo(repl);
            if (history[i].in_progress)
                output.text('Hang on, still thinking about this one...');
            else
                fillOutputSection(output, history[i]);
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
