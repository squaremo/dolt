# Evaluation server

    $ npm install
    $ node server >/dev/null &
    $ node test-client.js
    Creating session...
    > 42
    => 42
    > $1 * 2
    => 84
    > get("https://api.github.com/users/dpw")
    => { type: 'User',
      gravatar_id: '43cc7cf81c0bb2097ced5195d2db9b88',
      login: 'dpw',
    ...

## Protocol

POST to `/api/session` to establish a session (i.e. a record of
previously evaluated expressions to support dollar references):

    $ curl -d '' http://localhost:8000/api/session
    {
      "eval_uri": "/api/session/b23cfd30-0dfb-11e2-9c15-1bbbb195e204/eval"
    }

Then POST expressions to `eval_uri` to have them evaluated:

    $ curl -d '1+2' http://localhost:8000/api/session/b23cfd30-0dfb-11e2-9c15-1bbbb195e204/eval
    {
      "result": 3
    }
    $ curl -d 'foo' http://localhost:8000/api/session/b23cfd30-0dfb-11e2-9c15-1bbbb195e204/eval
    {
      "error": "ReferenceError: foo is not defined"
    }