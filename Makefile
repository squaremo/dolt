PEGJS:=./node_modules/pegjs/bin/pegjs
GRAMMAR:=server/grammar.pegjs
PARSERS:=server/parser.js client/parser.js

.PHONY: all test start-server clean clean-sessions

all: start-server

server/parser.js: $(GRAMMAR)
	$(PEGJS) --cache $< $@

client/parser.js: $(GRAMMAR)
	$(PEGJS) --cache -e window.Parser $< $@

test: $(PARSERS)
	node ./node_modules/nodeunit/bin/nodeunit server/test

start-server: $(PARSERS)
	(cd server; node ./server.js)

clean:
	rm -f $(PARSERS)

clean-sessions:
	rm -f /tmp/session-*.json
