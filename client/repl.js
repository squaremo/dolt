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
        output = $('<section/>');
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
        case 'date':
            return $('<code/>')
                .append($('<time/>').addClass(t).text(String(value)));
        case 'object':
            if (value === null) {
                t = 'null';
                break;
            }
            else {
                return printComposite(
                    value, (Array.isArray(value)) ? 'array' : 'object');
            }
        case 'function':
            value = '[Function]';
            break;
        }

        return $('<code/>').addClass(t).text(String(value));
    }

    function printComposite(obj, t) {
        return ((isCompact(obj)) ? printCompact(obj, t) : printFull(obj, t)).addClass('composite');
    }

    // totally ad-hoc. Other methods: items are ground types and there
    // are fewer than x (trickier for objects than arrays, since keys
    // can be long ..); only do this for arrays; etc.
    function isCompact(obj) {
        return JSON.stringify(obj).length < 30;
    }

    function printCompact(obj, t) {
        var outer = $((t === 'array') ? '<ol/>' : '<ul/>').addClass(t);
        for (var k in obj) {
            outer.append($('<li/>').addClass('item')
                         .append($('<span/>').addClass('key')
                                   .text(JSON.stringify(k)),
                                 $('<span/>').addClass('value')
                                   .append(print(obj[k]))))
        }
        return outer;
    }

    function printFull(obj, t) {
        var outer = $('<table/>').addClass(t);
        for (var k in obj) {
            outer.append($('<tr/>').addClass('item')
                         .append($('<td/>') .addClass('key')
                                   .text(JSON.stringify(k)),
                                 $('<td/>').addClass('value')
                                   .append(print(obj[k]))))
        }
        return outer;
    }

    function printArray(arr) {
        return printObject(arr, 'array');
    }
});
