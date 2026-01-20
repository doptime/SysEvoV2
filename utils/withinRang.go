package utils

func WithinRangeI64(min, max int, values ...*int64) {
	for _, value := range values {
		if *value < int64(min) {
			*value = int64(min)
		} else if *value > int64(max) {
			*value = int64(max)
		}
	}
}
