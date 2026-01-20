// analyzers/ts/index.js
const ts = require('typescript');
const fs = require('fs');

// 1. 获取目标文件路径 (从命令行参数)
const targetFile = process.argv[2];
if (!targetFile) {
    console.error("Error: No target file provided");
    process.exit(1);
}

try {
    // 2. 读取文件内容 (只读，不修改)
    const sourceCode = fs.readFileSync(targetFile, 'utf-8');

    // 3. 创建 SourceFile 对象 (这是 TS 编译器的内存对象，不依赖 tsconfig)
    const sourceFile = ts.createSourceFile(
        targetFile,
        sourceCode,
        ts.ScriptTarget.Latest,
        true // setParentNodes
    );

    const chunks = [];

    // 4. 遍历 AST
    function visit(node) {
        // 识别关键节点
        if (ts.isFunctionDeclaration(node) || 
            ts.isMethodDeclaration(node) || 
            ts.isClassDeclaration(node) || 
            ts.isInterfaceDeclaration(node)) {
            
            const name = node.name ? node.name.text : 'anonymous';
            const start = node.getStart();
            const end = node.getEnd();
            const body = sourceCode.substring(start, end);

            // 生成骨架 (Skeleton)
            // 策略：如果是函数/方法，把大括号里的内容替换为 " ... "
            let skeleton = body;
            if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
                // 查找第一个 '{' 和最后一个 '}'
                const firstBrace = body.indexOf('{');
                const lastBrace = body.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    skeleton = body.substring(0, firstBrace + 1) + " ... " + body.substring(lastBrace);
                }
            }

            // 提取脏链接 (Symbols)
            // 简单正则提取，忽略 JS 关键字
            const words = body.match(/[a-zA-Z_]\w+/g) || [];
            const keywords = new Set(['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'class', 'interface', 'import', 'export', 'from', 'null', 'undefined', 'true', 'false', 'new', 'this']);
            const refs = [...new Set(words)].filter(w => !keywords.has(w) && w.length > 2);

            chunks.push({
                id: `${targetFile}:${name}`,
                type: ts.SyntaxKind[node.kind], // 数字类型，Go 端可以转
                skeleton: skeleton,
                body: body,
                symbols_referenced: refs
            });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // 5. 输出标准 JSON 到 Stdout
    console.log(JSON.stringify(chunks));

} catch (e) {
    // 捕获所有错误，输出空数组，保证 Go 端不崩
    console.error(`Analyzer Error: ${e.message}`);
    console.log("[]");
    process.exit(0); // 正常退出，让 Go 继续处理下一个
}