# -*- mode: coffee; tab-width: 4 -*-

{createServer} = require('http')
{exists, createReadStream} = require('fs')

handle = (req, res) ->
    if req.method == 'GET'
        url = if req.url == '/' then '/index.html' else req.url
        sendFile(url, res);
    else
        slurp(req, (d) -> res.end(
            try
                result(eval(d))
            catch err
                error(err)))

sendFile = (path, res) ->
    file = '../client' + path
    exists(file, (r) ->
        if r
            createReadStream(file).pipe(res)
        else
            res.writeHead(404, 'Not found')
            res.end())

result = (d) -> JSON.stringify({result: d})
error  = (e) -> JSON.stringify({error: e})

slurp = (s, k) ->
    buf = ''
    s.setEncoding('utf8')
    s.on('data', (d) -> buf += d)
    s.on('end', -> k(buf))


app = createServer(handle)
app.listen(3000)
