PEGJS:=./node_modules/pegjs/bin/pegjs
GRAMMAR:=server/grammar.pegjs

.PHONY: parsers test

parsers: node_modules/pegjs server/parser.js client/parser.js

server/parser.js: $(GRAMMAR)
	$(PEGJS) $< $@

client/parser.js: $(GRAMMAR)
	$(PEGJS) -e window.Parser $< $@

test: node_modules/nodeunit parsers
	node ./node_modules/nodeunit/bin/nodeunit server/test

start-server: parsers
	(cd server; node ./server.js)
