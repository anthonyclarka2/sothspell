package greeter

import "testing"

func TestGreet(t *testing.T) {
	if Greet([]string{"a"}) != "hello a" {
		t.Fatal("unexpected greeting")
	}
}
