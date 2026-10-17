// Package greeter builds greetings.
package greeter

import (
	"fmt"
	"strings"

	"example.com/fixture/internal/store"
)

// MaxLength caps a greeting.
const MaxLength = 80

// ErrEmptyName is returned for an empty name.
var ErrEmptyName = fmt.Errorf("empty name")

// Store keeps greetings.
type Store interface {
	// Save stores one message.
	Save(name string, message string) error
	// Load returns a stored message.
	Load(name string) (string, error)
}

// Greeter builds greetings through a Store.
type Greeter struct {
	Store *store.Store
	Count int
}

// New returns a Greeter.
func New(s *store.Store) *Greeter {
	return &Greeter{Store: s}
}

// Greet returns the greeting for one name.
func (g *Greeter) Greet(name string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", ErrEmptyName
	}
	return fmt.Sprintf("hello %s", name), nil
}

func greetAll(names []string) []string {
	messages := make([]string, 0, len(names))
	for _, name := range names {
		message, err := New(nil).Greet(name)
		if err == nil {
			messages = append(messages, message)
		}
	}
	return messages
}

// Greet greets every name.
func Greet(names []string) string {
	return strings.Join(greetAll(names), ", ")
}
