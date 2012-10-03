window.onload = function() {
    console.log('ok');
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
            output.innerText = result.result;
        });
        repl.appendChild(output);
        return prompt();
    }

    function sendToBeEvaluated(exp, k) {
        setTimeout(function() { k({result: exp}); }, 3000);
    }
    
    prompt();
}
