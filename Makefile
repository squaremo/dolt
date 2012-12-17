PEGJS:=./node_modules/pegjs/bin/pegjs

.PHONY: parsers test

parsers: node_modules/pegjs server/javascript.js client/javascript.js

server/javascript.js: server/javascript.pegjs
	$(PEGJS) $< server/javascript.js

client/javascript.js: server/javascript.pegjs
	$(PEGJS) -e window.Parser $< client/javascript.js

test: node_modules/nodeunit parsers
	node ./node_modules/nodeunit/bin/nodeunit server/test

start-server: parsers
	(cd server; node ./server.js)
