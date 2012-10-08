'use strict';

var misc = require('../misc');

module.exports.parseContentType = function (assert) {
    function assertCT(ct, expect) {
        assert.deepEqual(misc.parseContentType(ct.replace(/#/g,'')), expect);
        assert.deepEqual(misc.parseContentType(ct.replace(/#/g,'\t ')), expect);
    }

    assertCT('#text/plain#', {
        type: 'text',
        subtype: 'plain'
    });

    assertCT('#text/plain#;#charset=UTF-8#', {
        type: 'text',
        subtype: 'plain',
        charset: 'UTF-8'
    });

    assertCT('#text/plain#;#foo="bar"#', {
        type: 'text',
        subtype: 'plain',
        foo: 'bar'
    });

    assertCT('#text/plain#;#foo=" bar \\" baz "#;#charset=UTF-8#', {
        type: 'text',
        subtype: 'plain',
        charset: 'UTF-8',
        foo: ' bar " baz '
    });

    assert.done();
};
