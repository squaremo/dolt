'use strict';

var express = require('express');
var mu = require('mu2');
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

// Utility to hook a promise up to a SockJS connection
function respond(connection, p) {
    when(p, function(out) {
        connection.write(out);
    }, function (err) {
        if (err.stack) { console.log(err.stack); }
        connection.close(500, err.toString()+"\r\n");
    });
}

mu.root = path;

app.get('/(index(.html)?)?', function(req, res) {
    var session = Session.enumSessions().then(function(ids) {
        mu.compileAndRender('index.html', {sessions: ids})
            .pipe(res);
    });
});

app.post('/new', function(req, res) {
    var session = Session.newSession();
    res.writeHead(303, 'Session created', {'Location': '/#' + session.id});
    session.saveState().then(function() {
        mu.compileAndRender('new.html', {session: session.id}).pipe(res);
    });
});

sockjs.on('connection', function(connection) {

    function getHistory(state) {
        return state.history;
    }

    connection.once('data', function (id) {
        var session = Session.fromId(id);
        connection.on('data', handler(session, connection));
        respond(connection, Session.stringify(session.state.then(getHistory)));
    });
});

function handler(session, connection) {
    return function(data) {
        respond(connection, Session.stringify(session.eval(data)));
    };
}

console.log("Serving files from " + path + " at " + host + ":" + port);
server.listen(port, host);
