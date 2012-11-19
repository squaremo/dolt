PEGJS:=./node_modules/pegjs/bin/pegjs

.PHONY: parsers test

parsers: node_modules/pegjs server/javascript.js client/tokenizer.js

server/javascript.js:
	$(PEGJS) server/javascript.pegjs server/javascript.js

client/tokenizer.js:
	$(PEGJS) -e 'window.tokenizer' tokenizer.pegjs client/tokenizer.js

test: node_modules/nodeunit
	node ./node_modules/nodeunit/bin/nodeunit server/test

start-server: parsers
	(cd server; node ./server.js)
