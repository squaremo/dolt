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
        result = box.value;
        output = document.createElement('pre');
        output.innerText = result;
        repl.appendChild(output);
        return prompt();
    }
    
    prompt();
}
