// Package store keeps greetings in memory.
package store

// Store is a tiny in-memory store.
type Store struct {
	items map[string]string
}

// New returns an empty Store.
func New() *Store {
	return &Store{items: map[string]string{}}
}

// Save stores one message.
func (s *Store) Save(name string, message string) error {
	s.items[name] = message
	return nil
}

// Load returns the stored message.
func (s *Store) Load(name string) (string, error) {
	return s.items[name], nil
}
