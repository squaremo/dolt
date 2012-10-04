$(function() {

    var XHR_DONE = 4;
    
    var repl = $('#repl');
    var current;
    var eval_uri;

    var spin = $('<img/>').attr('src', 'ajax-loader.gif');
    var form = $('<form/>').addClass('prompt')
        .append('<label/>')
        .append('<input/>');

    function catastrophe(error) {
        console.error(error);
        $('#errors').append($('<h3/>').addClass('fatal').text(error));
    }

    $.post('/api/session', function(data) {
        eval_uri = data.eval_uri;
        prompt();
    }, 'json');

    function prompt() {
        current = form.clone();
        current.submit(evaluate);
        repl.append(current);
        current.find('input').focus();
        return false;
    }

    function evaluate() {
        var expression = current.find('input').val();
        output = $('<pre/>');
        var s = spin.clone();
        output.append(s);
        current.replaceWith($('<kbd/>').addClass('history')
                            .append('<code/>').text(expression));
        sendToBeEvaluated(expression, function(result) {
            s.remove();
            if (result.hasOwnProperty('value')) {
                output.append(assignment(result.variable, result.value));
            }
            else {
                output.append($('<span/>').text("Error: " + result.error));
            }
        });
        repl.append(output);
        return prompt();
    }

    function sendToBeEvaluated(exp, k) {
        $.post(eval_uri, exp, k, 'json');
    }

    function assignment(symbol, value) {
        return $('<div/>').addClass('result')
            .append($('<var/>').text(symbol))
            .append(print(value));
    }

    function print(value) {
        var t = typeof value;
        switch (t) {
        case 'string':
        case 'number':
        case 'boolean':
            return $('<code/>').addClass(t).text(String(value))
        case 'date':
            return $('<code/>')
                .append($('<time/>').addClass(t).text(String(value)));
        case 'object':
            return (Array.isArray(value)) ?
                printArray(value) :
                printObject(value);
        case 'function':
            return $('<code/>').addClass(t).text('[Function]');
        }
    }

    function printObject(obj, t) {
        t = t || 'object';
        var outer = $('<dl/>').addClass(t);
        for (var k in obj) {
            outer.append($('<dt/>').text(JSON.stringify(k)))
                .append($('<dd/>').append(print(obj[k])));
        }
        return outer;
    }

    function printArray(arr) {
        return printObject(arr, 'array');
    }
});
