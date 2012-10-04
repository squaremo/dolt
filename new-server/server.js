'use strict';

var express = require('express');
var when = require('when');
var Session = require('./session');
var misc = require('./misc');

var path = process.env.PWD + "/public";
var host = process.env.VCAP_APP_HOST || '0.0.0.0';
var port = process.env.VCAP_APP_PORT || 8000;

var app = express();
app.configure(function(){
    app.use(express.logger());
    app.use(app.router);
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// Utility to hook a promise up to an Express response
function respond(res, p) {
    when(p, function(out) {
        res.send(200, out);
    }, function (err) {
        if (err.stack) { console.log(err.stack); }
        res.type("text/plain");
        res.send(500, err.toString()+"\r\n");
    });
}

var sessions = {};

app.post('/api/session', function (req, res) {
    var s = new Session();
    sessions[s.id] = s;
    res.type('application/json');
    respond(res, {eval_uri: "/api/session/" + s.id + "/eval"});
});

app.post('/api/session/:id/eval', function (req, res) {
    var s = sessions[req.params.id];
    if (s) {
        res.type('application/json');
        respond(res, misc.readAll(req).then(function (body) {
            return s.eval(body.toString('utf8'));
        }));
    } else {
        res.send(404);
    }
});

console.log("Serving files from " + path + " at " + host + ":" + port);
app.listen(port, host);
