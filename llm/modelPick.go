package llm

import (
	"fmt"
	"math"
	"math/rand/v2"
	"slices"
	"time"

	"github.com/mroth/weightedrand"
	"github.com/spf13/afero"
)

// 模块结构体（简化版）
type Module struct {
	Name     string // 模块名称
	BranchId string // 模块Id

	EloScore  int64   // 模块评分
	Milestone float64 // 1: file/code constructed, 2:file/code tested, 3:hardware constructed, 4:hardware tested, 5:Income generated

	ProblemToSolve []string // 模块所属问题域
	DesignIdeas    []string
	OuterModuleIds []string
	InnerModuleIds []string
}

func (m *Module) SourceCodes() (fileList []string) {
	fs := afero.NewOsFs()
	files, _ := afero.ReadDir(fs, "./"+m.BranchId)
	for _, file := range files {
		content, _ := afero.ReadFile(fs, "./"+m.BranchId+"/"+file.Name())
		fileList = append(fileList, "file-name:\n"+file.Name()+"\ncontent:\n"+string(content))
	}
	return fileList
}

func (m Module) Id() string {
	return m.BranchId
}

func (m Module) Rating(delta int) int {
	return int(m.EloScore) + delta
}

func LoadbalancedPick(models ...*Model) *Model {
	Choices := make([]weightedrand.Choice, len(models))
	for i, model := range models {
		weight := uint(500000 / (model.ResponseTime().Seconds() + math.Sqrt(model.requestPerMin)))
		Choices[i] = weightedrand.Choice{Item: model, Weight: weight}
	}
	ModelPicker, _ := weightedrand.NewChooser(Choices...)
	return ModelPicker.Pick().(*Model)
}

type ModelList struct {
	Name         string
	SelectCursor int
	Models       []*Model
}

var EloModels = ModelList{
	Name: "EloModels",
	Models: []*Model{
		Qwen3Next80B,
		Qwen30BA3,
	},
}

func NewModelList(name string, models ...*Model) *ModelList {
	return &ModelList{
		Name:   name,
		Models: models,
	}
}

func (list *ModelList) SequentialPick(firstToStart ...*Model) (ret *Model) {
	if len(list.Models) == 0 {
		panic("no models defined for list")
	}
	if list.SelectCursor == 0 && len(firstToStart) > 0 {
		list.SelectCursor = slices.Index(list.Models, firstToStart[0]) + len(list.Models)
	}
	ret = list.Models[list.SelectCursor%len(list.Models)]
	list.SelectCursor++
	return ret
}

var lastPrintAverageResponseTime time.Time = time.Now()

func PrintAverageResponseTime() {
	go func() {
		time.Sleep(1 * time.Second)
		if time.Since(lastPrintAverageResponseTime) < 10*time.Second {
			return
		}
	}()
	lastPrintAverageResponseTime = time.Now()
	for _, model := range EloModels.Models {
		model.mutex.RLock()
		fmt.Printf("Model %s: %v\n", model.Name, model.ResponseTime())
		model.mutex.RUnlock()
	}
}

func (list *ModelList) SelectOne(policy string) *Model {
	if len(list.Models) == 0 {
		return nil
	}
	PrintAverageResponseTime()
	// Calculate weights for each model
	weights := make([]float64, len(list.Models))
	var sum float64
	fatestIndex := 0
	fatestResponseTime := int64(99999999999)
	for i, model := range list.Models {
		model.mutex.RLock()
		avgTime := model.ResponseTime()
		if avgTime.Microseconds() < fatestResponseTime {
			fatestResponseTime = avgTime.Microseconds()
			fatestIndex = i
		}
		model.mutex.RUnlock()
		weights[i] = math.Sqrt(1 / float64(avgTime.Microseconds()))
		sum += weights[i]
	}

	switch policy {
	case "random":
		// Select model based on weights
		randNum := rand.Float64()
		var cumulativeWeight float64

		for i, weight := range weights {
			cumulativeWeight += (weight / sum)
			if randNum < cumulativeWeight {
				return list.Models[i]
			}
		}
		fmt.Println("No model selected! use last model")
		// Fallback to last model if no selection was made
		return list.Models[len(list.Models)-1]

	case "roundrobin":
		selectIndex := list.SelectCursor % len(list.Models)
		if fatestIndex == selectIndex && rand.Float64() < 0.1 {
			return list.Models[fatestIndex]
		} else {
			list.SelectCursor += 1
			return list.Models[selectIndex]
		}
	}
	return list.Models[0]
}
