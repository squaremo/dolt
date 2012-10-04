'use strict';

var readline = require('readline');
var urlmod = require('url');
var util = require('util');
var misc = require('./misc');

var baseUrl = process.argv[2] || "http://localhost:8000";

console.log("Creating session...");
var url = baseUrl + "/api/session";
misc.post(url).then(function (session) {
    var evalUrl = urlmod.resolve(url, session.eval_uri);

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.setPrompt("> ");
    rl.prompt();
    rl.on("line", function (l) {
        misc.post(evalUrl, l).then(function (res) {
            if ('value' in res) {
                console.log("=> " + util.inspect(res.value));
            }
            if ('error' in res) {
                console.error(res.error);
            }

            rl.prompt();
        }, function (err) {
            process.nextTick(function () {
                process.nextTick(function () { rl.prompt(); });
                throw err;
            });
        });
    });
}, function (err) {
    process.nextTick(function () {
        throw err;
    });
});
