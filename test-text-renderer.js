const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 构造虚拟浏览器上下文以加载 shared/components/media-hub.js
const context = {
    window: {},
    document: { querySelector: () => null, getElementById: () => null },
    navigator: {}
};
context.global = context.window;
vm.createContext(context);

const mediaHubCode = fs.readFileSync(path.join(__dirname, 'shared/components/media-hub.js'), 'utf8');
vm.runInContext(mediaHubCode, context);

const MediaHub = context.window.MediaHubComponent;
assert(typeof MediaHub === 'function', 'MediaHubComponent must be defined');

const hub = new MediaHub();

console.log('Testing MediaHub code highlighting...');
const codeOut = hub._renderHighlightedCode('const x = 123;\nfunction test() { return "hello"; }', 'js', true);
assert(codeOut.includes('syn-kw'), 'Keyword highlighted');
assert(codeOut.includes('syn-num'), 'Number highlighted');
assert(codeOut.includes('syn-str'), 'String highlighted');
assert(codeOut.includes('code-lineno'), 'Line numbers present');

console.log('Testing MediaHub markdown parsing...');
const mdSample = [
    '# Hello World',
    '',
    '> A nice quote here',
    '',
    '- [x] Task 1',
    '- [ ] Task 2',
    '',
    '| Name | Type | Note |',
    '| :--- | :--: | ---: |',
    '| LanDisk | Web | Fast |',
    '',
    'Check out [My Link](https://example.com) and `inlineCode` and **bold** and *italic*!',
    '',
    '```javascript',
    'const msg = "lan interconnect";',
    'console.log(msg);',
    '```'
].join('\n');

const mdOut = hub._renderMarkdown(mdSample);
assert(mdOut.includes('<h1 class="md-h1">'), 'Heading 1 parsed');
assert(mdOut.includes('<blockquote class="md-quote">'), 'Blockquote parsed');
assert(mdOut.includes('md-task-item'), 'Task item parsed');
assert(mdOut.includes('<table class="md-table">'), 'Table parsed');
assert(mdOut.includes('md-inline-code'), 'Inline code parsed');
assert(mdOut.includes('md-code-block'), 'Code block parsed');
assert(mdOut.includes('syn-str'), 'Code block inside markdown is highlighted');
assert(mdOut.includes('data-code='), 'Code copy button has data-code attribute');

console.log('Testing edge cases & XSS protections...');

// 1. Empty & whitespace
assert.strictEqual(hub._renderMarkdown(''), '<div class="markdown-body"></div>');
assert.strictEqual(hub._renderMarkdown('   \n\n  '), '<div class="markdown-body"></div>');
assert.strictEqual(hub._renderHighlightedCode('', 'js'), '');

// 2. XSS in markdown
const xssMd = '<script>alert(1)</script> <img src=x onerror=alert(2)> [evil](javascript:alert(3)) `<b>safe</b>`';
const xssOut = hub._renderMarkdown(xssMd);
assert(!xssOut.includes('<script>'), 'Script tag escaped');
assert(xssOut.includes('&lt;script&gt;'), 'Script tag escaped as entity');
assert(!xssOut.includes('<img src=x'), 'Raw HTML tag not rendered as element');
assert(xssOut.includes('&lt;img src=x onerror=alert(2)&gt;'), 'Raw HTML img tag escaped as entity');
assert(!xssOut.includes('href="javascript:'), 'Javascript: link protocol blocked');
assert(xssOut.includes('&lt;b&gt;safe&lt;/b&gt;'), 'Inline code HTML escaped');

// 3. Unclosed code block in markdown
const unclosedMd = '```js\nconst unclosed = true;\n';
const unclosedOut = hub._renderMarkdown(unclosedMd);
assert(typeof unclosedOut === 'string' && unclosedOut.length > 0, 'Handled unclosed code block without crash');

// 4. HTML/XML highlighting
const htmlCode = '<div class="test" id="app"><span>Hello</span></div>';
const htmlOut = hub._renderHighlightedCode(htmlCode, 'html', true);
assert(htmlOut.includes('syn-tag'), 'HTML tag highlighted');
assert(htmlOut.includes('syn-attr'), 'HTML attr highlighted');
assert(!htmlOut.includes('<div class="test"'), 'Raw HTML tag not rendered unescaped');

// 5. Python strings & comments
const pyCode = '# Comment here\ns = """multi\nline"""\ndef foo():\n    return None';
const pyOut = hub._renderHighlightedCode(pyCode, 'py', true);
assert(pyOut.includes('syn-comment'), 'Python comment highlighted');
assert(pyOut.includes('syn-str'), 'Python multiline string highlighted');
assert(pyOut.includes('syn-kw'), 'Python keyword def highlighted');
assert(pyOut.includes('syn-atom'), 'Python None highlighted');

// 6. SQL syntax
const sqlCode = 'SELECT id, name FROM users WHERE active = true ORDER BY id DESC;';
const sqlOut = hub._renderHighlightedCode(sqlCode, 'sql', true);
assert(sqlOut.includes('syn-kw'), 'SQL keywords highlighted');

console.log('All MediaHub Markdown and Syntax Highlighting tests PASSED successfully!');