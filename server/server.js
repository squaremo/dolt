'use strict';

var express = require('express');
var when = require('when');
var Session = require('./session');
var misc = require('./misc');
var SockJS = require('sockjs');

var path = process.env.PWD + "/../client";
var host = process.env.VCAP_APP_HOST || '0.0.0.0';
var port = process.env.VCAP_APP_PORT || 8000;

var app = express();
var server = require('http').createServer(app);
var sockjs = SockJS.createServer();
sockjs.installHandlers(server, {prefix: '/eval'});

app.configure(function(){
    app.use(express.logger());
    app.use(app.router);
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    app.use(express.static(path));
});

// Utility to hook a promise up to an Express response
function respond(connection, p) {
    when(p, function(out) {
        connection.write(out);
    }, function (err) {
        if (err.stack) { console.log(err.stack); }
        connection.close(500, err.toString()+"\r\n");
    });
}

var session = new Session();

sockjs.on('connection', function(connection) {
    connection.on('data', handler(session, connection));
    respond(connection, Session.stringify(session.history));
});

function handler(session, connection) {
    return function(data) {
        respond(connection, Session.stringify(session.eval(data)));
    };
}

console.log("Serving files from " + path + " at " + host + ":" + port);
server.listen(port, host);
