package analysis

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"sysevov2/models"
	"sysevov2/storage"
)

// RunParallelIndexing 并发执行索引构建
// roots: 根目录列表 (e.g. ["./backend", "./frontend"])
// numThreads: 并发协程数
func RunParallelIndexing(roots []string, numThreads int) error {
	if numThreads <= 0 {
		numThreads = 1
	}

	var wg sync.WaitGroup
	// 使用缓冲 channel 作为信号量限制并发协程数
	semaphore := make(chan struct{}, numThreads)
	// 用于捕获并发过程中的错误
	errChan := make(chan error, len(roots))

	fmt.Printf("🚀 Starting parallel indexing with %d threads...\n", numThreads)

	for _, root := range roots {
		wg.Add(1)
		go func(path string) {
			defer wg.Done()

			// 获取信号量（如果达到 numThreads 则阻塞）
			semaphore <- struct{}{}
			defer func() { <-semaphore }() // 释放信号量

			fmt.Printf("🧵 Thread processing: %s\n", path)

			if err := RunIncrementalIndexing(path); err != nil {
				fmt.Printf("❌ Error indexing %s: %v\n", path, err)
				errChan <- err
			}
		}(root)
	}

	wg.Wait()
	close(errChan)

	if len(errChan) > 0 {
		return fmt.Errorf("parallel indexing completed with %d errors", len(errChan))
	}

	fmt.Println("✅ Parallel indexing finished successfully.")
	return nil
}

// RunIncrementalIndexing 执行单目录的增量代码分析与索引构建
func RunIncrementalIndexing(projectRoot string) error {
	return filepath.Walk(projectRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			// 忽略常见非代码目录
			if strings.HasPrefix(info.Name(), ".") || info.Name() == "vendor" || info.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}

		ext := filepath.Ext(path)
		if ext != ".go" && ext != ".ts" && ext != ".tsx" {
			return nil
		}

		// 2. 增量检查 (Check Metadata)
		lastMod, _ := storage.FileMetaKey.HGet(path)
		if info.ModTime().Unix() <= lastMod {
			return nil // 跳过未修改文件
		}

		fmt.Printf("🔍 Indexing: %s\n", path)

		// 3. 解析代码 (Parse)
		var chunks []*models.Chunk
		var parseErr error

		if ext == ".go" {
			chunks, parseErr = ParseGoFile(path)
		} else {
			// 假设 ParseTSFile 在同包下的 parser_ts_sidecar.go 中定义
			chunks, parseErr = ParseTSFile(path)
		}

		if parseErr != nil {
			fmt.Printf("⚠️ Parse Error %s: %v\n", path, parseErr)
			return nil
		}

		// 4. 存储与索引 (Store & Index)
		for _, chunk := range chunks {
			chunk.UpdatedAt = time.Now().Unix()

			// A. 存储 Chunk 内容 (Hash)
			if _, err := storage.ChunkStorage.HSet(chunk.ID, chunk); err != nil {
				fmt.Printf("❌ DB Error: %v\n", err)
			}

			// B. 【核心修复】建立反向索引 (Set: Symbol -> ChunkIDs)
			// 这使得 Selector 可以通过 Symbol 找到定义它的 Chunk
			for _, symbol := range chunk.SymbolsDefined {
				if len(symbol) < 2 {
					continue
				}
				// 写入 Redis Set: sys/idx/sym/{symbol}
				if err := storage.Indexer.AddSymbolLink(symbol, chunk.ID); err != nil {
					fmt.Printf("⚠️ Index Error: %v\n", err)
				}
			}
		}

		// 5. 更新元数据 (标记该文件已处理)
		storage.FileMetaKey.HSet(path, info.ModTime().Unix())

		return nil
	})
}

// ParseGoFile 解析单个 Go 文件并返回 Chunks
func ParseGoFile(path string) ([]*models.Chunk, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, path, content, parser.ParseComments)
	if err != nil {
		return nil, err
	}

	var chunks []*models.Chunk

	// 遍历 AST 顶级声明
	for _, decl := range node.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			// 提取函数或方法
			chunks = append(chunks, extractGoFunc(d, fset, path, content))
		case *ast.GenDecl:
			// 提取类型定义 (struct, interface)
			for _, spec := range d.Specs {
				if typeSpec, ok := spec.(*ast.TypeSpec); ok {
					chunks = append(chunks, extractGoType(d, typeSpec, fset, path, content))
				}
			}
		}
	}

	return chunks, nil
}

// extractGoFunc 提取函数/方法 Chunk
func extractGoFunc(fn *ast.FuncDecl, fset *token.FileSet, path string, content []byte) *models.Chunk {
	name := fn.Name.Name
	// 处理 Receiver (方法): User.Save
	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		recvType := ""
		expr := fn.Recv.List[0].Type
		// 处理指针 *User 和普通 User
		if star, ok := expr.(*ast.StarExpr); ok {
			if ident, ok := star.X.(*ast.Ident); ok {
				recvType = ident.Name
			}
		} else if ident, ok := expr.(*ast.Ident); ok {
			recvType = ident.Name
		}
		if recvType != "" {
			name = recvType + "." + name
		}
	}

	// 构造唯一 ID: filepath:FunctionName
	id := fmt.Sprintf("%s:%s", path, name)

	// 提取完整代码 (Body)
	start := fset.Position(fn.Pos()).Offset
	end := fset.Position(fn.End()).Offset
	fullBody := string(content[start:end])

	// 生成骨架 (Skeleton)
	skeleton := generateGoSkeleton(fn, fset)

	return &models.Chunk{
		ID:                id,
		Type:              "Function",
		Skeleton:          skeleton,
		Body:              fullBody,
		SymbolsDefined:    []string{name},            // 定义了自己
		SymbolsReferenced: extractGoSymbols(fn.Body), // 引用了别人
		FilePath:          path,
	}
}

// extractGoType 提取结构体/接口 Chunk
func extractGoType(decl *ast.GenDecl, spec *ast.TypeSpec, fset *token.FileSet, path string, content []byte) *models.Chunk {
	name := spec.Name.Name
	id := fmt.Sprintf("%s:%s", path, name)

	start := fset.Position(decl.Pos()).Offset
	end := fset.Position(decl.End()).Offset
	fullBody := string(content[start:end])

	return &models.Chunk{
		ID:                id,
		Type:              "Type",
		Skeleton:          fullBody, // 对于 Type，骨架即全文
		Body:              fullBody,
		SymbolsDefined:    []string{name},
		SymbolsReferenced: extractGoSymbols(spec.Type), // 扫描字段类型依赖
		FilePath:          path,
	}
}

// generateGoSkeleton 生成骨架: 把函数体掏空，换成 "..."
func generateGoSkeleton(fn *ast.FuncDecl, fset *token.FileSet) string {
	// 浅拷贝 AST 节点，避免修改原结构影响后续处理
	tempFn := *fn
	// 替换函数体为一个空的 BlockStmt
	tempFn.Body = &ast.BlockStmt{
		List: []ast.Stmt{
			&ast.ExprStmt{X: &ast.Ident{Name: "..."}}, // 占位符
		},
		Lbrace: fn.Body.Lbrace,
		Rbrace: fn.Body.Rbrace,
	}

	var buf bytes.Buffer
	printer.Fprint(&buf, fset, &tempFn)
	return buf.String()
}

// extractGoSymbols 提取 AST 节点中引用的所有标识符
func extractGoSymbols(node ast.Node) []string {
	refs := make(map[string]struct{})
	if node == nil {
		return nil
	}

	// 深度优先遍历 AST
	ast.Inspect(node, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.CallExpr:
			// 捕获函数调用: foo() -> foo
			if ident, ok := x.Fun.(*ast.Ident); ok {
				refs[ident.Name] = struct{}{}
			} else if sel, ok := x.Fun.(*ast.SelectorExpr); ok {
				// 捕获方法调用: pkg.Foo() -> Foo, pkg
				refs[sel.Sel.Name] = struct{}{}
				if id, ok := sel.X.(*ast.Ident); ok {
					refs[id.Name] = struct{}{}
				}
			}
		case *ast.SelectorExpr:
			// 捕获属性访问: user.Name -> Name
			refs[x.Sel.Name] = struct{}{}
		case *ast.CompositeLit:
			// 捕获结构体初始化: &User{} -> User
			if ident, ok := x.Type.(*ast.Ident); ok {
				refs[ident.Name] = struct{}{}
			}
		case *ast.Ident:
			// 备选策略：如果需要更激进的索引，可以取消注释
			// refs[x.Name] = struct{}{}
		}
		return true
	})

	var list []string
	for k := range refs {
		// 简单的去噪，忽略太短的变量名
		if len(k) > 1 {
			list = append(list, k)
		}
	}
	return list
}
