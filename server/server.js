'use strict';

var express = require('express');
var when = require('when');
var Session = require('./session');
var misc = require('./misc');

var path = process.env.PWD + "/../client";
var host = process.env.VCAP_APP_HOST || '0.0.0.0';
var port = process.env.VCAP_APP_PORT || 8000;

var app = express();
app.configure(function(){
    app.use(express.logger());
    app.use(app.router);
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    app.use(express.static(path));
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

var session = new Session();

app.post('/api/eval', function (req, res) {
    res.type('application/json');
    respond(res, misc.readAll(req).then(function (body) {
        return Session.stringify(session.eval(body.toString('utf8')));
    }));
});

app.get('/api/history', function (req, res) {
    res.type('application/json');
    respond(res, Session.stringify(session.history));
});

console.log("Serving files from " + path + " at " + host + ":" + port);
app.listen(port, host);
