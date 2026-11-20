const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const notices = [];
const obsidian = {
    moment: { locale: () => 'en' },
    Notice: class { constructor(message) { notices.push(message); } },
    MarkdownRenderer: { renderMarkdown: () => Promise.resolve() }
};

class TestNode {
    constructor(data, mindmap) {
        this.data = { ...data };
        this.mindmap = mindmap;
        this.children = [];
        this.isExpand = true;
        this.contentEl = { innerHTML: '' };
    }
    getId() { return this.data.id; }
    getData() { return { ...this.data }; }
    getIndex() { return this.parent.children.indexOf(this); }
    getLevel() { return this.parent ? this.parent.getLevel() + 1 : 0; }
    getNextSibling() {
        if (!this.parent) return this;
        return this.parent.children[(this.getIndex() + 1) % this.parent.children.length];
    }
    addChild(node, index) {
        if (index === undefined || index < 0) this.children.push(node);
        else this.children.splice(index, 0, node);
        node.parent = this;
    }
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index >= 0) this.children.splice(index, 1);
        return index;
    }
    parseText() {}
    setText(text) { return RealNode.prototype.setText.call(this, text); }
    setPosition() {}
    refreshBox() {}
    clearCacheData() {}
    select() { this.mindmap.selectNode = this; }
    unSelect() {}
    expand() { this.isExpand = true; }
    collapse() { this.isExpand = false; }
}

Module._extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true }
    }).outputText;
    module._compile(output, filename);
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'obsidian') return obsidian;
    if (request === 'svg.js') return () => {};
    if (request === './INode' && parent?.filename.endsWith(`${path.sep}Cmds.ts`)) return TestNode;
    return originalLoad.call(this, request, parent, isMain);
};
const RealNode = require('../src/mindmap/INode.ts').default;
const MindMap = require('../src/mindmap/mindmap.ts').default;
const Exec = require('../src/mindmap/Execute.ts').default;
Module._load = originalLoad;

function createMap() {
    const map = Object.create(MindMap.prototype);
    map.setting = { headLevel: 2 };
    map.mindScale = 100;
    map.exec = new Exec();
    map.root = new TestNode({ id: 'root', text: 'Root', isRoot: true }, map);
    map.addNode = (node, parent, index) => parent.addChild(node, index);
    map.removeNode = node => node.parent.removeChild(node);
    map.clearSelectNode = () => { map.selectNode = undefined; };
    map.scale = () => {};
    map.emit = (name) => {
        if (name === 'mindMapChange') map.savedMarkdown = map.getMarkdown();
    };
    return map;
}

function child(map, parent, id, text) {
    const node = new TestNode({ id, text }, map);
    parent.addChild(node);
    return node;
}

function previousTextCallback(plugin) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
    let callback;
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'this.addCommand') {
            const object = node.arguments[0];
            if (object && ts.isObjectLiteralExpression(object)) {
                const id = object.properties.find(p => p.name?.getText(tree) === 'id');
                if (id?.initializer?.text === 'Replace by the previous text') {
                    callback = object.properties.find(p => p.name?.getText(tree) === 'callback').initializer.getText(tree);
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.ok(callback);
    return new Function('MindMapView', 'Notice', 't', `return (${callback});`)
        .call(plugin, class {}, obsidian.Notice, s => s);
}

for (const citation of [false, true]) {
    test(`join ${citation ? 'as citation' : 'normally'} is one reversible operation with children`, () => {
        const map = createMap();
        const first = child(map, map.root, 'first', 'Start [🔗](file.pdf) (p. 7)');
        const existing = child(map, first, 'existing', 'Existing');
        const second = child(map, map.root, 'second', '😀 Next');
        const nested = child(map, second, 'nested', 'Nested');
        child(map, nested, 'deep', 'Deep');
        child(map, second, 'other', 'Other');
        first.isExpand = false;
        first.select();

        map.joinWithFollowingNode(first, citation);
        assert.equal(first.data.text, `Start  ${citation ? '(…)' : ''}<br>Next`);
        assert.equal(map.exec.history.undos.length, 1);
        assert.deepEqual(map.root.children, [first]);
        assert.deepEqual(first.children.map(n => n.data.text), ['Existing', 'Nested', 'Other']);
        assert.equal(first.children[1].children[0].data.text, 'Deep');
        assert.equal(first.isExpand, true);
        const copied = first.children[1];
        map.exec.execute('changeNodeText', { node: copied, oldText: 'Nested', text: 'Changed' });
        map.undo();
        map.undo();
        assert.deepEqual(map.root.children, [first, second]);
        assert.deepEqual(first.children, [existing]);
        assert.equal(first.data.text, 'Start [🔗](file.pdf) (p. 7)');
        assert.equal(first.isExpand, false);
        assert.equal(second.children[0], nested);
        map.redo();
        assert.equal(first.children[1], copied);
        map.redo();
        assert.equal(first.children[1].data.text, 'Changed');
        assert.match(map.savedMarkdown, /Changed/);
    });
}

test('joining an only child leaves the tree and history untouched', () => {
    const map = createMap();
    const only = child(map, map.root, 'only', 'Only');
    map.joinWithFollowingNode(only, false);
    assert.deepEqual(map.root.children, [only]);
    assert.equal(map.exec.history.undos.length, 0);
});

test('joining leaf siblings is undoable without creating extra history entries', () => {
    const map = createMap();
    const first = child(map, map.root, 'first', 'First');
    const second = child(map, map.root, 'second', 'Second');
    map.joinWithFollowingNode(first, false);
    assert.equal(first.data.text, 'First <br>Second');
    map.undo();
    assert.deepEqual(map.root.children, [first, second]);
    assert.equal(first.data.text, 'First');
    map.redo();
    assert.deepEqual(map.root.children, [first]);
    assert.equal(first.data.text, 'First <br>Second');
});

test('previous text is recorded for edits, replacement, undo and redo', () => {
    const map = createMap();
    const node = child(map, map.root, 'one', 'Before');
    node.select();
    const plugin = { app: { workspace: { getActiveViewOfType: () => ({ mindmap: map }) } } };
    const callback = previousTextCallback(plugin);
    callback();
    assert.equal(node.data.text, 'Before');
    assert.equal(notices.at(-1), 'No previous text for this node');
    map.exec.execute('changeNodeText', { node, oldText: 'Before', text: 'After' });
    callback();
    assert.equal(node.data.text, 'Before');
    assert.equal(node.previousText, 'After');
    assert.match(map.savedMarkdown, /Before/);
    map.undo();
    assert.equal(node.data.text, 'After');
    map.redo();
    assert.equal(node.data.text, 'Before');
    assert.throws(() => node.setText(undefined), /non-string/);
    assert.equal(node.data.text, 'Before');
});

test('missing previous text does not corrupt a subsequent gray formatting save', () => {
    const map = createMap();
    const node = child(map, map.root, 'one', 'Text');
    node.select();
    const plugin = { app: { workspace: { getActiveViewOfType: () => ({ mindmap: map }) } } };
    previousTextCallback(plugin)();
    map._formatNode(node, '~={grey}', '~={grey}', '=~');
    assert.equal(node.data.text, '~={grey}Text=~');
    assert.match(map.savedMarkdown, /~=\{grey\}Text=~/);
});

test('replacing text while editing first records the current edit', () => {
    const map = createMap();
    const node = child(map, map.root, 'one', 'Before');
    node.data.isEdit = true;
    node.select();
    map.clearSelectNode = () => {
        node.data.isEdit = false;
        map.exec.execute('changeNodeText', { node, oldText: 'Before', text: 'Edited' });
        map.selectNode = undefined;
    };
    const plugin = { app: { workspace: { getActiveViewOfType: () => ({ mindmap: map }) } } };
    previousTextCallback(plugin)();
    assert.equal(node.data.text, 'Before');
    assert.equal(node.previousText, 'Edited');
    map.undo();
    assert.equal(node.data.text, 'Edited');
});

test('gray and strike toggles preserve text and serialize without an error', () => {
    const map = createMap();
    const node = child(map, map.root, 'one', 'Text');
    node.select();
    map._formatNode(node, '~={grey}', '~={grey}', '=~');
    assert.equal(node.data.text, '~={grey}Text=~');
    assert.match(map.savedMarkdown, /~=\{grey\}Text=~/);
    map._formatNode(node, '~~', '~~');
    assert.equal(node.data.text, '~~.~={grey}Text=~.~~');
    map._formatNode(node, '~~', '~~');
    assert.equal(node.data.text, '~={grey}Text=~');
    map.undo();
    assert.equal(node.data.text, '~~.~={grey}Text=~.~~');
    map.redo();
    assert.equal(node.data.text, '~={grey}Text=~');
    map._formatNode(node, '~~', '~~');
    map._formatNode(node, '~={grey}', '~={grey}', '=~');
    assert.equal(node.data.text, '~~Text~~');
});

test('striking selected gray text in edit mode toggles the separators', () => {
    let text = '~={grey}Text=~';
    const range = { deleteContents() {}, insertNode(node) { text = node.text; } };
    global.window = { getSelection: () => ({ rangeCount: 1, toString: () => text, getRangeAt: () => range }) };
    global.document = { createTextNode: value => ({ text: value }) };
    try {
        RealNode.prototype.setSelectedText('~~', '~~', '', true, true, true);
        assert.equal(text, '~~.~={grey}Text=~.~~');
        RealNode.prototype.setSelectedText('~~', '~~', '', true, true, true);
        assert.equal(text, '~={grey}Text=~');
        RealNode.prototype.setSelectedText('~~', '~~', '', true, true, true);
        RealNode.prototype.setSelectedText('~={grey}', '~={grey}', '=~', true, true, true);
        assert.equal(text, '~~Text~~');
    } finally {
        delete global.window;
        delete global.document;
    }
});
