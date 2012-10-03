window.onload = function() {

    var XHR_DONE = 4;
    
    var repl = document.getElementById('repl');
    var input, box;

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
            if (result.hasOwnProperty('result')) {
                output.innerText = JSON.stringify(result.result);
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
        req.open('POST', '/', true);
        req.onreadystatechange = function() {
            if (req.readyState === XHR_DONE) {
                k(JSON.parse(req.responseText));
            }
        };
        req.send(exp);
    }
    
    prompt();
}
