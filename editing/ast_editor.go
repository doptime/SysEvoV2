package editing

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"strings"

	"sysevov2/models"
)

// ApplyModification 执行单个代码变更
func ApplyModification(mod *models.CodeModification) error {
	fmt.Printf("🔨 Applying edit to: %s [%s]\n", mod.FilePath, mod.ActionType)

	if mod.ActionType == "CREATE_FILE" {
		return os.WriteFile(mod.FilePath, []byte(mod.NewContent), 0644)
	}
	if mod.ActionType == "DELETE" && mod.TargetChunkID == "" {
		return os.Remove(mod.FilePath)
	}

	// 1. 读取源文件
	contentBytes, err := os.ReadFile(mod.FilePath)
	if err != nil {
		return err
	}

	// 2. 实时解析 AST (Just-In-Time) 以获取最新偏移量
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, mod.FilePath, contentBytes, parser.ParseComments)
	if err != nil {
		return fmt.Errorf("parse failed: %v", err)
	}

	// 3. 定位目标 Chunk
	start, end := findChunkRange(fset, node, mod.TargetChunkID)

	// 4. 执行替换或追加
	var newContent []byte
	if start != -1 && end != -1 {
		// 替换模式
		if mod.ActionType == "DELETE" {
			newContent = append(contentBytes[:start], contentBytes[end:]...)
		} else {
			// MODIFY
			newContent = append(contentBytes[:start], []byte(mod.NewContent)...)
			newContent = append(newContent, contentBytes[end:]...)
		}
	} else {
		// 追加模式 (Fallback)
		newContent = append(contentBytes, []byte("\n\n"+mod.NewContent)...)
	}

	// 5. 写回文件
	if err := os.WriteFile(mod.FilePath, newContent, 0644); err != nil {
		return err
	}

	// 6. 自动修复 Imports (Goimports)
	if strings.HasSuffix(mod.FilePath, ".go") {
		exec.Command("goimports", "-w", mod.FilePath).Run()
	}

	return nil
}

// findChunkRange 辅助函数：在 AST 中定位 ID
func findChunkRange(fset *token.FileSet, node *ast.File, chunkID string) (int, int) {
	// 从 chunkID "main.go:User.Save" 提取 "User.Save"
	parts := strings.Split(chunkID, ":")
	targetName := parts[len(parts)-1]

	var start, end = -1, -1

	ast.Inspect(node, func(n ast.Node) bool {
		if start != -1 {
			return false
		} // 已找到

		switch x := n.(type) {
		case *ast.FuncDecl:
			// 拼接 Receiver 名字
			name := x.Name.Name
			if x.Recv != nil && len(x.Recv.List) > 0 {
				recvType := ""
				if star, ok := x.Recv.List[0].Type.(*ast.StarExpr); ok {
					if id, ok := star.X.(*ast.Ident); ok {
						recvType = id.Name
					}
				} else if id, ok := x.Recv.List[0].Type.(*ast.Ident); ok {
					recvType = id.Name
				}
				if recvType != "" {
					name = recvType + "." + name
				}
			}
			if name == targetName {
				start = fset.Position(x.Pos()).Offset
				end = fset.Position(x.End()).Offset
			}
		case *ast.GenDecl:
			// 匹配结构体/接口定义
			if x.Tok == token.TYPE && len(x.Specs) > 0 {
				if ts, ok := x.Specs[0].(*ast.TypeSpec); ok {
					if ts.Name.Name == targetName {
						start = fset.Position(x.Pos()).Offset
						end = fset.Position(x.End()).Offset
					}
				}
			}
		}
		return true
	})
	return start, end
}
