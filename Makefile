PEGJS:=./node_modules/pegjs/bin/pegjs
GRAMMAR:=server/grammar.pegjs

.PHONY: parsers test postinstall link-js start-server clean-sessions

parsers: node_modules/pegjs server/parser.js client/parser.js

server/parser.js: $(GRAMMAR)
	$(PEGJS) $< $@

client/parser.js: $(GRAMMAR)
	$(PEGJS) -e window.Parser $< $@

test: node_modules/nodeunit parsers
	node ./node_modules/nodeunit/bin/nodeunit server/test

postinstall: parsers link-js

link-js: client/pmd.js

client/pmd.js:
	ln -s ../node_modules/pmd/index.js client/pmd.js

start-server: parsers link-js
	(cd server; node ./server.js)

clean-sessions:
	rm /tmp/session-*.json
