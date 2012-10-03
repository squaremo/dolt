# -*- mode: coffee; tab-width: 4 -*-

{createServer} = require('http')

handle = (req, res) ->
    slurp(req, (d) -> res.end(
        try
            result(eval(d))
        catch err
            error(err)))

result = (d) -> JSON.stringify({result: d})
error  = (e) -> JSON.stringify({error: e})

slurp = (s, k) ->
    buf = ''
    s.setEncoding('utf8')
    s.on('data', (d) -> buf += d)
    s.on('end', -> k(buf))

app = createServer(handle)
app.listen(3000)
