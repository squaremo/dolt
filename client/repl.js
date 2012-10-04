window.onload = function() {

    var XHR_DONE = 4;
    
    var repl = document.getElementById('repl');
    var input, box;
    var eval_uri;

    var session = new XMLHttpRequest();
    session.open('POST', '/api/session', true);
    session.onreadystatechange = function() {
        if (session.readyState == XHR_DONE) {
            var result = JSON.parse(session.responseText);
            eval_uri = result.eval_uri;
            prompt();
        }
    }
    session.send('');

    function prompt() {
        input = document.createElement('form');
        box = document.createElement('input');
        input.appendChild(box);
        input.onsubmit = evaluate;
        repl.appendChild(input);
        box.focus();
        return false;
    }

    function evaluate() {
        expression = box.value;
        output = document.createElement('pre');
        spin = document.createElement('img');
        spin.src = 'ajax-loader.gif';
        output.appendChild(spin);
        sendToBeEvaluated(expression, function(result) {
            output.removeChild(spin);
            if (result.hasOwnProperty('value')) {
                output.appendChild(print(result.value));
            }
            else {
                output.innerText = "Error: " + result.error;
            }
        });
        repl.appendChild(output);
        return prompt();
    }

    function sendToBeEvaluated(exp, k) {
        var req = new XMLHttpRequest();
        req.open('POST', eval_uri, true);
        req.onreadystatechange = function() {
            if (req.readyState === XHR_DONE) {
                k(JSON.parse(req.responseText));
            }
        };
        req.send(exp);
    }

    function print(value) {
        var t = typeof value;
        switch (t) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'date':
            var elem = document.createElement('span');
            elem.setAttribute('class', t);
            elem.innerText = String(value);
            return elem;
        case 'object':
            return (Array.isArray(value)) ?
                printArray(value) :
                printObject(value);
        case 'function':
            var elem = document.createElement('span');
            elem.setAttribute('class', t);
            elem.innerText = '[Function]';
            return elem;
        }
    }

    function printObject(obj, t) {
        t = t || 'object';
        var outer = document.createElement('dl');
        outer.setAttribute('class', t);
        for (var k in obj) {
            var kelem = document.createElement('dt');
            kelem.innerText = JSON.stringify(k);
            var velem = document.createElement('dd');
            velem.setAttribute('class', 'item');
            velem.appendChild(print(obj[k]));
            outer.appendChild(kelem);
            outer.appendChild(velem);
        }
        return outer;
    }

    function printArray(arr) {
        return printObject(arr, 'array');
    }
}
