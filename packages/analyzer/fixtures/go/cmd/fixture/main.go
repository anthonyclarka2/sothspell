// Command fixture greets the names it is given.
package main

import (
	"fmt"
	"os"

	"example.com/fixture/internal/greeter"
)

func main() {
	fmt.Println(greeter.Greet(os.Args[1:]))
}
