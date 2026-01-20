package utils

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

func FromTomlFile(filePath string, structPtr interface{}) (err error) {
	_, err = toml.DecodeFile(filePath, &structPtr)
	return err
}
func ToTomlFile(filePath string, structPtr interface{}) error {
	// Create the TOML file
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	// Encode the struct into the TOML file
	if err := toml.NewEncoder(file).Encode(structPtr); err != nil {
		return fmt.Errorf("failed to encode TOML: %w", err)
	}

	return nil
}
