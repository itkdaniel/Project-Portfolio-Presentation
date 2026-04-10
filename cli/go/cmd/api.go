package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/nexusconsult/nexus-cli/internal/client"
	"github.com/olekukonko/tablewriter"
	"github.com/spf13/cobra"
)

var apiCmd = &cobra.Command{
	Use:   "api",
	Short: "Direct API endpoint access — GET, POST, PATCH, DELETE, batch",
	Long:  `Raw access to all NexusConsult REST API endpoints.`,
}

// ── get ───────────────────────────────────────────────────────────────────────

var apiGetFormat string

var apiGetCmd = &cobra.Command{
	Use:   "get <path>",
	Short: "GET an API endpoint",
	Long: `Perform a GET request and display the JSON response.

Examples:
  nexus api get /api/projects
  nexus api get /api/projects --format table
  nexus api get /api/auth/me
  nexus api get /api/admin/stats`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		data, err := client.GetRaw(args[0])
		if err != nil {
			return err
		}
		if apiGetFormat == "table" {
			var rows []map[string]interface{}
			if err := json.Unmarshal(data, &rows); err == nil && len(rows) > 0 {
				printTable(rows)
				return nil
			}
		}
		var pretty interface{}
		if err := json.Unmarshal(data, &pretty); err == nil {
			out, _ := json.MarshalIndent(pretty, "", "  ")
			fmt.Println(string(out))
		} else {
			fmt.Println(string(data))
		}
		return nil
	},
}

// ── post ──────────────────────────────────────────────────────────────────────

var apiPostCmd = &cobra.Command{
	Use:   "post <path> <json-body>",
	Short: "POST JSON body to an API endpoint",
	Long: `POST a JSON body to any API endpoint.

Examples:
  nexus api post /api/bookings '{"name":"Alice","email":"a@b.com","details":"test","date":"2026-04-15","time":"10:00"}'
  nexus api post /api/auth/login '{"email":"admin@nexusconsult.dev","password":"Admin@Nexus2024!"}'`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		var body interface{}
		if err := json.Unmarshal([]byte(args[1]), &body); err != nil {
			return fmt.Errorf("invalid JSON body: %w", err)
		}
		var resp interface{}
		if err := client.Post(args[0], body, &resp); err != nil {
			return err
		}
		out, _ := json.MarshalIndent(resp, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ── patch ─────────────────────────────────────────────────────────────────────

var apiPatchCmd = &cobra.Command{
	Use:   "patch <path> <json-body>",
	Short: "PATCH a resource with partial JSON body",
	Long: `Perform a PATCH request with a JSON body.

Example:
  nexus api patch /api/projects/abc123 '{"status":"archived"}'`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		var body interface{}
		if err := json.Unmarshal([]byte(args[1]), &body); err != nil {
			return fmt.Errorf("invalid JSON body: %w", err)
		}
		var resp interface{}
		if err := client.Patch(args[0], body, &resp); err != nil {
			return err
		}
		out, _ := json.MarshalIndent(resp, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ── delete ────────────────────────────────────────────────────────────────────

var apiDeleteYes bool

var apiDeleteCmd = &cobra.Command{
	Use:   "delete <path>",
	Short: "DELETE a resource",
	Long: `Perform a DELETE request.

Examples:
  nexus api delete /api/projects/abc123
  nexus api delete /api/projects/abc123 --yes`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if !apiDeleteYes {
			fmt.Printf("DELETE %s? [y/N]: ", args[0])
			var confirm string
			fmt.Scan(&confirm)
			if strings.ToLower(confirm) != "y" {
				fmt.Println("Aborted.")
				return nil
			}
		}
		if err := client.Delete(args[0]); err != nil {
			return err
		}
		fmt.Printf("%s Deleted %s\n", green("✓"), args[0])
		return nil
	},
}

// ── batch ─────────────────────────────────────────────────────────────────────

var apiBatchCmd = &cobra.Command{
	Use:   "batch <path1> [path2] ...",
	Short: "Parallel GET multiple endpoints simultaneously",
	Long: `Fetch multiple API endpoints concurrently using goroutines.

Example:
  nexus api batch /api/projects /api/auth/me /api/admin/stats`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Printf("%s Fetching %d endpoints in parallel…\n", cyan("→"), len(args))
		results := client.ParallelGet(args)
		for _, r := range results {
			fmt.Printf("\n%s %s %s\n", bold("──"), cyan(r.Path), bold("──"))
			if r.Error != nil {
				fmt.Printf("%s %v\n", red("Error:"), r.Error)
				continue
			}
			var pretty interface{}
			_ = json.Unmarshal(r.Data, &pretty)
			out, _ := json.MarshalIndent(pretty, "", "  ")
			fmt.Println(string(out))
		}
		return nil
	},
}

// ── endpoints ─────────────────────────────────────────────────────────────────

var apiEndpointsCmd = &cobra.Command{
	Use:   "endpoints",
	Short: "List all available API endpoints",
	Long: `Display all NexusConsult REST API endpoints with their auth requirements.

Example:
  nexus api endpoints`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rows := [][]string{
			{"GET",    "/api/projects",         "public",  "List all published projects"},
			{"POST",   "/api/projects",         "admin",   "Create a new project"},
			{"PATCH",  "/api/projects/:id",     "admin",   "Update a project"},
			{"DELETE", "/api/projects/:id",     "admin",   "Delete a project"},
			{"POST",   "/api/auth/login",       "public",  "Login — returns JWT"},
			{"POST",   "/api/auth/register",    "public",  "Register a new user"},
			{"GET",    "/api/auth/me",          "auth",    "Current user profile"},
			{"POST",   "/api/bookings",         "public",  "Submit a booking"},
			{"GET",    "/api/bookings",         "admin",   "List all bookings"},
			{"POST",   "/api/inquiries",        "public",  "Submit an inquiry"},
			{"GET",    "/api/admin/stats",      "admin",   "Admin dashboard stats"},
			{"GET",    "/api/tests/results",    "public",  "Latest test results"},
			{"POST",   "/api/tests/run",        "public",  "Trigger a test run"},
			{"PATCH",  "/api/users/role",       "admin",   "Update user's corp role"},
		}
		t := tablewriter.NewWriter(os.Stdout)
		t.SetHeader([]string{"Method", "Path", "Auth", "Description"})
		t.SetBorder(true)
		for _, row := range rows {
			t.Append(row)
		}
		t.Render()
		return nil
	},
}

func printTable(rows []map[string]interface{}) {
	if len(rows) == 0 {
		return
	}
	keys := make([]string, 0)
	for k := range rows[0] {
		keys = append(keys, k)
	}
	t := tablewriter.NewWriter(os.Stdout)
	t.SetHeader(keys)
	t.SetBorder(true)
	for _, row := range rows {
		vals := make([]string, len(keys))
		for i, k := range keys {
			vals[i] = fmt.Sprintf("%v", row[k])
		}
		t.Append(vals)
	}
	t.Render()
}

func init() {
	apiGetCmd.Flags().StringVarP(&apiGetFormat,  "format", "f", "json", "Output format: json or table")
	apiDeleteCmd.Flags().BoolVarP(&apiDeleteYes, "yes",    "y", false,  "Skip confirmation")
	apiCmd.AddCommand(apiGetCmd, apiPostCmd, apiPatchCmd, apiDeleteCmd, apiBatchCmd, apiEndpointsCmd)
}
