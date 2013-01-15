PEGJS:=./node_modules/pegjs/bin/pegjs
GRAMMAR:=server/grammar.pegjs
PARSERS:=server/parser.js client/parser.js

.PHONY: all parsers test postinstall link-js start-server clean-sessions

all: start-server

server/parser.js: $(GRAMMAR)
	$(PEGJS) --cache $< $@

client/parser.js: $(GRAMMAR)
	$(PEGJS) --cache -e window.Parser $< $@

test: $(PARSERS)
	node ./node_modules/nodeunit/bin/nodeunit server/test

start-server: $(PARSERS)

postinstall: parsers link-js

link-js: client/pmd.js

client/pmd.js:
	ln -s ../node_modules/pmd/index.js client/pmd.js

start-server: parsers link-js
	(cd server; node ./server.js)

clean:
	rm -f $(PARSERS)

clean-sessions:
	rm -f /tmp/session-*.json
