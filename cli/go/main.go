// Command nexus is the NexusConsult platform CLI (Go edition).
// It provides identical functionality to the Python CLI via cobra subcommands.
package main

import "github.com/nexusconsult/nexus-cli/cmd"

func main() {
	cmd.Execute()
}
