// Package cmd implements the nexus CLI command tree using cobra.
package cmd

import (
	"fmt"
	"os"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	cyan  = color.New(color.FgCyan).SprintFunc()
	green = color.New(color.FgGreen).SprintFunc()
	red   = color.New(color.FgRed).SprintFunc()
	bold  = color.New(color.Bold).SprintFunc()
	dim   = color.New(color.FgHiBlack).SprintFunc()
)

var rootCmd = &cobra.Command{
	Use:   "nexus",
	Short: "NexusConsult platform CLI",
	Long: fmt.Sprintf(`%s — NexusConsult Automation Consulting Platform

Unified CLI for API access, Docker/K8s infrastructure, portfolio management,
AI/ML data pipelines, and corporate role-based access control.

%s
  nexus auth login                       Authenticate and store JWT
  nexus api endpoints                    List all API routes
  nexus portfolio list                   View portfolio projects
  nexus infra start                      Start Docker services
  nexus data ratings                     View data access tiers
  nexus model train <corpus>             Train an AI/ML model
  nexus ai search "query"                Semantic project search

%s
  NEXUS_API_URL   Override API base URL  (default: http://localhost:5000)
  NEXUS_TOKEN     Override stored JWT token
  NEXUS_ROLE_ID   Override corporate role ID (1–8)

Run %s for detailed usage on any command or subcommand.`,
		bold("nexus"),
		bold("QUICKSTART"),
		bold("ENV VARS"),
		cyan("nexus <command> --help"),
	),
	Version: "1.0.0",
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, red("Error: ")+err.Error())
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(authCmd)
	rootCmd.AddCommand(apiCmd)
	rootCmd.AddCommand(infraCmd)
	rootCmd.AddCommand(portfolioCmd)
	rootCmd.AddCommand(dataCmd)
	rootCmd.AddCommand(modelCmd)
	rootCmd.AddCommand(aiCmd)
}
