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
	// 处理纯删除文件的情况
	if mod.ActionType == "DELETE" && mod.TargetChunkID == "" {
		return os.Remove(mod.FilePath)
	}

	// 1. 读取源文件
	contentBytes, err := os.ReadFile(mod.FilePath)
	if err != nil {
		return err
	}

	// 2. 实时解析 AST
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, mod.FilePath, contentBytes, parser.ParseComments)
	if err != nil {
		return fmt.Errorf("parse failed: %v", err)
	}

	// 3. 定位目标 Chunk
	start, end := findChunkRange(fset, node, mod.TargetChunkID)

	// 4. 执行替换或追加
	var newContent []byte

	// Case A: 成功定位到目标 Chunk -> 执行替换或删除
	if start != -1 && end != -1 {
		if mod.ActionType == "DELETE" {
			newContent = append(contentBytes[:start], contentBytes[end:]...)
		} else {
			// MODIFY
			newContent = append(contentBytes[:start], []byte(mod.NewContent)...)
			newContent = append(newContent, contentBytes[end:]...)
		}
	} else {
		// Case B: 未定位到目标

		// [修复核心]：如果是 MODIFY/DELETE 且找不到目标，必须报错！
		// 只有明确是 "ADD" 或者找不到时的特定逻辑才允许追加
		if mod.ActionType == "MODIFY" || mod.ActionType == "DELETE" {
			return fmt.Errorf("chunk not found for %s: %s (offsets: -1, -1)", mod.ActionType, mod.TargetChunkID)
		}

		// 只有在非 MODIFY 情况下（例如明确的 ADD 指令），才执行追加作为回退
		// 追加模式 (Fallback)
		// 注意：如果原文件末尾没有换行，最好补一个
		sep := "\n\n"
		if len(contentBytes) > 0 && contentBytes[len(contentBytes)-1] != '\n' {
			sep = "\n" + sep
		}
		newContent = append(contentBytes, []byte(sep+mod.NewContent)...)
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
	// [修复]：增加 TrimSpace，防止 "extractGoDefinitions " 这种带尾随空格的情况导致不匹配
	targetName := strings.TrimSpace(parts[len(parts)-1])

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
				// ... (原有 receiver 处理逻辑保持不变) ...
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

			// [建议]：如果你的 ID 系统可能包含包名 (如 analysis.extractGoSymbols)，
			// 你可以在这里加一个逻辑：如果 targetName 包含点但没匹配上，尝试仅匹配函数名部分。
			if name == targetName {
				start = fset.Position(x.Pos()).Offset
				end = fset.Position(x.End()).Offset
			}
		// ... (GenDecl 逻辑保持不变) ...
		case *ast.GenDecl:
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
