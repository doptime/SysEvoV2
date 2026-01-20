package analysis

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"

	"sysevov2/models"
)

// ParseGoFile 对 .go 文件进行原子化尸检
func ParseGoFile(path string) ([]*models.Chunk, error) {
	fset := token.NewFileSet()
	// ParseComments: 必须保留注释，这是 LLM 理解意图的关键
	node, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var chunks []*models.Chunk

	// 遍历 AST 顶层声明
	for _, decl := range node.Decls {
		switch d := decl.(type) {

		// Case 1: 函数与方法
		case *ast.FuncDecl:
			chunk := extractGoFunc(d, fset, path, content)
			chunks = append(chunks, chunk)

		// Case 2: 类型定义 (Struct/Interface)
		case *ast.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					if typeSpec, ok := spec.(*ast.TypeSpec); ok {
						chunk := extractGoType(d, typeSpec, fset, path, content)
						chunks = append(chunks, chunk)
					}
				}
			}
		}
	}
	return chunks, nil
}
