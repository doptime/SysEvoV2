package tool

import (
	"encoding/json"
	"log"
	"reflect"
	"strings"

	"github.com/mitchellh/mapstructure"
	openai "github.com/sashabaranov/go-openai"

	genai "google.golang.org/genai"
)

type ToolInterface interface {
	HandleCallback(Param interface{}, CallMemory map[string]any) (err error)
	OaiTool() *openai.Tool
	GoogleGenaiTool() *genai.FunctionDeclaration
	Name() string
}

// Tool 是FuctionCall的逻辑实现。FunctionCall 是Tool的接口定义
type Tool[v any] struct {
	openai.Tool
	GoogleFunc genai.FunctionDeclaration
	Functions  []func(param v)
}

func (t *Tool[v]) OaiTool() *openai.Tool {
	return &t.Tool
}
func (t *Tool[v]) GoogleGenaiTool() *genai.FunctionDeclaration {
	return &t.GoogleFunc
}
func (t *Tool[v]) Name() string {
	return t.Tool.Function.Name
}

func (t *Tool[v]) WithFunction(f func(param v)) *Tool[v] {
	t.Functions = append(t.Functions, f)
	return t
}

func (t *Tool[v]) HandleCallback(Param interface{}, CallMemory map[string]any) (err error) {
	var parambytes []byte
	if str, ok := Param.(string); ok {
		parambytes = []byte(str)
	} else {
		parambytes, err = json.Marshal(Param)
		if err != nil {
			log.Printf("Error parsing arguments for tool %s: %v", t.Tool.Function.Name, err)
		}
	}

	var val v
	err = json.Unmarshal(parambytes, &val) // 直接反序列化到 v 的地址
	if err != nil {
		log.Printf("Error parsing arguments for tool %s: %v。make sure type of v is a ponter to struct", t.Tool.Function.Name, err)
		return err
	}
	//Extract the memory cached key to destination struct
	if CallMemory != nil {
		mapstructure.Decode(CallMemory, val)
	}

	for _, f := range t.Functions {
		f(val)
	}
	if CallMemory != nil {
		// 确保传入的是一个 struct
		v := reflect.ValueOf(val)
		for v.Kind() == reflect.Ptr {
			v = v.Elem() // 如果是指针，获取其指向的值
		}
		if v.Kind() == reflect.Struct {
			t := v.Type()

			// 遍历 struct 的所有字段
			for i := 0; i < v.NumField(); i++ {
				field := v.Field(i)
				fieldName := t.Field(i).Name

				// 将字段名和字段值添加到 map 中
				CallMemory[fieldName] = field.Interface()
			}

		}

	}

	return nil
}

// NewTool creates a new tool, correctly generating schemas for nested structs and slices.
func NewTool[v any](name string, description string, fs ...func(param v)) *Tool[v] {
	vType := reflect.TypeOf(new(v)).Elem()
	for vType.Kind() == reflect.Ptr {
		vType = vType.Elem()
	}

	oaiProperties := make(map[string]any)
	googleProperties := make(map[string]*genai.Schema)

	if vType.Kind() == reflect.Struct {
		for i := 0; i < vType.NumField(); i++ {
			field := vType.Field(i)
			desc := field.Tag.Get("description")
			if desc == "-" {
				continue
			}

			// Generate the schema for each field's type using the recursive helper.
			fieldOAI, fieldGoogle := buildSchemaForType(field.Type)

			// The description from the tag belongs to the property definition itself.
			fieldOAI["description"] = desc
			fieldGoogle.Description = desc

			oaiProperties[field.Name] = fieldOAI
			googleProperties[field.Name] = fieldGoogle
		}
	} else {
		log.Printf("Warning: Tool %s is created with a non-struct parameter type. No parameters will be defined.", name)
	}

	// Construct the final top-level schema object that describes the tool's parameters.
	oaiParams := map[string]any{
		"type":       "object",
		"properties": oaiProperties,
	}
	googleSchema := &genai.Schema{
		Type:       genai.TypeObject,
		Properties: googleProperties,
	}

	a := &Tool[v]{
		Tool: openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        name,
				Description: description,
				Parameters:  oaiParams,
			},
		},
		GoogleFunc: genai.FunctionDeclaration{
			Name:        name,
			Description: description,
			Parameters:  googleSchema,
		},
		Functions: fs,
	}
	return a
}

// buildSchemaForType is the recursive helper function. It generates the schema for any given type.
func buildSchemaForType(t reflect.Type) (map[string]any, *genai.Schema) {
	// Dereference pointers until we reach the base type
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}

	oaiSchema := make(map[string]any)
	googleSchema := &genai.Schema{}

	oaiSchema["type"] = mapKindToDataType(t.Kind())
	googleSchema.Type = KindToJSONType(t.Kind())

	switch t.Kind() {
	case reflect.Struct:
		// When we encounter a nested struct, we must define its properties.
		oaiProperties := make(map[string]any)
		googleProperties := make(map[string]*genai.Schema)

		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			desc := field.Tag.Get("description")
			if desc == "-" {
				continue
			}

			// Recursive call for the nested struct's fields
			subOAI, subGoogle := buildSchemaForType(field.Type)

			subOAI["description"] = desc
			subGoogle.Description = desc

			oaiProperties[field.Name] = subOAI
			googleProperties[field.Name] = subGoogle
		}
		oaiSchema["properties"] = oaiProperties
		googleSchema.Properties = googleProperties

	case reflect.Slice, reflect.Array:
		// For a slice, we define the schema of its items.
		elemType := t.Elem()
		itemsOAI, itemsGoogle := buildSchemaForType(elemType) // Recursive call for the element type
		oaiSchema["items"] = itemsOAI
		googleSchema.Items = itemsGoogle
	}

	return oaiSchema, googleSchema
}

func mapKindToDataType(kind reflect.Kind) string {
	var mapKindToDataType = map[reflect.Kind]string{
		reflect.Struct:  "object",
		reflect.Float32: "number", reflect.Float64: "number",
		reflect.Int: "integer", reflect.Int8: "integer", reflect.Int16: "integer", reflect.Int32: "integer", reflect.Int64: "integer",
		reflect.Uint: "integer", reflect.Uint8: "integer", reflect.Uint16: "integer", reflect.Uint32: "integer", reflect.Uint64: "integer",
		reflect.String:  "string",
		reflect.Slice:   "array",
		reflect.Array:   "array",
		reflect.Bool:    "boolean",
		reflect.Invalid: "null",
		reflect.Map:     "object",
	}
	_type, ok := mapKindToDataType[kind]
	if !ok {
		return "type_unspecified"
	}
	return _type
}

func KindToJSONType(kind reflect.Kind) genai.Type {

	return genai.Type(strings.ToUpper(mapKindToDataType(kind)))

}
