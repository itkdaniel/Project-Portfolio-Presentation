package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/nexusconsult/nexus-cli/internal/client"
	"github.com/olekukonko/tablewriter"
	"github.com/spf13/cobra"
	"strings"
)

var portfolioCmd = &cobra.Command{
	Use:   "portfolio",
	Short: "Manage portfolio projects — add, remove, publish, organise",
	Long:  `Full CRUD management for the NexusConsult project portfolio.`,
}

// ── list ─────────────────────────────────────────────────────────────────────

var (
	portfolioListStatus   string
	portfolioListFeatured bool
	portfolioListFormat   string
)

var portfolioListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all portfolio projects",
	Long: `Display all portfolio projects in a table or JSON.

Examples:
  nexus portfolio list
  nexus portfolio list --status active
  nexus portfolio list --featured
  nexus portfolio list --format json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		var projects []map[string]interface{}
		if err := client.Get("/api/projects", &projects); err != nil {
			return err
		}
		// Filter
		filtered := make([]map[string]interface{}, 0)
		for _, p := range projects {
			if portfolioListStatus != "" && p["status"] != portfolioListStatus {
				continue
			}
			if portfolioListFeatured {
				if f, ok := p["featured"].(bool); !ok || !f {
					continue
				}
			}
			filtered = append(filtered, p)
		}

		if portfolioListFormat == "json" {
			out, _ := json.MarshalIndent(filtered, "", "  ")
			fmt.Println(string(out))
			return nil
		}

		t := tablewriter.NewWriter(os.Stdout)
		t.SetHeader([]string{"ID", "Name", "Type", "Status", "Published", "Featured", "Tags"})
		t.SetBorder(true)
		for _, p := range filtered {
			id   := fmt.Sprintf("%v", p["id"])
			if len(id) > 8 { id = id[:8] + "…" }
			tags := ""
			if tl, ok := p["tags"].([]interface{}); ok {
				ts := make([]string, 0, len(tl))
				for _, t := range tl { ts = append(ts, fmt.Sprintf("%v", t)) }
				tags = strings.Join(ts, ", ")
			}
			pub  := "✗"
			if v, ok := p["published"].(bool); ok && v { pub = "✓" }
			feat := "—"
			if v, ok := p["featured"].(bool);  ok && v { feat = "★" }
			t.Append([]string{
				id,
				fmt.Sprintf("%v", p["name"]),
				fmt.Sprintf("%v", p["type"]),
				fmt.Sprintf("%v", p["status"]),
				pub, feat, tags,
			})
		}
		t.Render()
		fmt.Printf("\n%s projects shown\n", dim(fmt.Sprintf("%d", len(filtered))))
		return nil
	},
}

// ── add ──────────────────────────────────────────────────────────────────────

var (
	addName        string
	addDescription string
	addType        string
	addTags        []string
	addGithub      string
	addStatus      string
	addPublished   bool
	addFeatured    bool
	addFromFile    string
)

var portfolioAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a new project to the portfolio",
	Long: `Create a new portfolio project (requires admin token).

Examples:
  nexus portfolio add --name "MyService" --description "A great service" --type microservice --tags docker --tags k8s
  nexus portfolio add --from-file project.json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		var payload map[string]interface{}

		if addFromFile != "" {
			data, err := os.ReadFile(addFromFile)
			if err != nil {
				return fmt.Errorf("read file: %w", err)
			}
			if err := json.Unmarshal(data, &payload); err != nil {
				return fmt.Errorf("parse JSON: %w", err)
			}
		} else {
			payload = map[string]interface{}{
				"name":        addName,
				"description": addDescription,
				"type":        addType,
				"tags":        addTags,
				"status":      addStatus,
				"published":   addPublished,
				"featured":    addFeatured,
			}
			if addGithub != "" {
				payload["githubUrl"] = addGithub
			}
		}

		var resp map[string]interface{}
		if err := client.Post("/api/projects", payload, &resp); err != nil {
			return err
		}
		id := fmt.Sprintf("%v", resp["id"])
		if len(id) > 8 { id = id[:8] + "…" }
		fmt.Printf("%s Project created: %s (id: %s)\n", green("✓"), cyan(fmt.Sprintf("%v", resp["name"])), id)
		return nil
	},
}

// ── update ────────────────────────────────────────────────────────────────────

var portfolioUpdateCmd = &cobra.Command{
	Use:   "update <project-id>",
	Short: "Update an existing project",
	Long: `Update portfolio project fields (requires admin token).

Examples:
  nexus portfolio update abc123 --status archived
  nexus portfolio update abc123 --name "New Name"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		payload := map[string]interface{}{}
		if cmd.Flags().Changed("name")   { payload["name"]   = addName }
		if cmd.Flags().Changed("description") { payload["description"] = addDescription }
		if cmd.Flags().Changed("status") { payload["status"] = addStatus }
		if cmd.Flags().Changed("github") { payload["githubUrl"] = addGithub }
		if cmd.Flags().Changed("tags")   { payload["tags"]   = addTags }
		if len(payload) == 0 {
			return fmt.Errorf("no fields to update — use --name, --status, --tags, etc.")
		}
		var resp map[string]interface{}
		if err := client.Patch("/api/projects/"+args[0], payload, &resp); err != nil {
			return err
		}
		fmt.Printf("%s Updated: %v\n", green("✓"), resp["name"])
		return nil
	},
}

// ── remove ────────────────────────────────────────────────────────────────────

var removeYes bool

var portfolioRemoveCmd = &cobra.Command{
	Use:   "remove <project-id>",
	Short: "Permanently remove a project",
	Long: `Delete a portfolio project (requires admin token).

Examples:
  nexus portfolio remove abc123
  nexus portfolio remove abc123 --yes`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if !removeYes {
			fmt.Printf("Delete project %s? [y/N]: ", args[0])
			var c string
			fmt.Scan(&c)
			if strings.ToLower(c) != "y" {
				fmt.Println("Aborted.")
				return nil
			}
		}
		if err := client.Delete("/api/projects/" + args[0]); err != nil {
			return err
		}
		fmt.Printf("%s Project %s deleted.\n", green("✓"), args[0])
		return nil
	},
}

// ── publish / unpublish / feature ─────────────────────────────────────────────

var portfolioPublishCmd = &cobra.Command{
	Use:   "publish <project-id>",
	Short: "Set project published=true",
	Long:  "Example:\n  nexus portfolio publish abc123",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return client.Patch("/api/projects/"+args[0], map[string]bool{"published": true}, nil)
	},
}

var portfolioUnpublishCmd = &cobra.Command{
	Use:   "unpublish <project-id>",
	Short: "Set project published=false",
	Long:  "Example:\n  nexus portfolio unpublish abc123",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return client.Patch("/api/projects/"+args[0], map[string]bool{"published": false}, nil)
	},
}

var featureOff bool
var portfolioFeatureCmd = &cobra.Command{
	Use:   "feature <project-id>",
	Short: "Toggle featured flag on a project",
	Long:  "Examples:\n  nexus portfolio feature abc123\n  nexus portfolio feature abc123 --off",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return client.Patch("/api/projects/"+args[0], map[string]bool{"featured": !featureOff}, nil)
	},
}

// ── export ────────────────────────────────────────────────────────────────────

var exportOutput string

var portfolioExportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export all projects to JSON file",
	Long: `Export all portfolio projects to a JSON file.

Examples:
  nexus portfolio export
  nexus portfolio export --output my-projects.json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		var projects interface{}
		if err := client.Get("/api/projects", &projects); err != nil {
			return err
		}
		out, _ := json.MarshalIndent(projects, "", "  ")
		if err := os.WriteFile(exportOutput, out, 0644); err != nil {
			return err
		}
		fmt.Printf("%s Exported to %s\n", green("✓"), exportOutput)
		return nil
	},
}

func init() {
	portfolioListCmd.Flags().StringVarP(&portfolioListStatus,   "status",   "s", "",      "Filter by status (active/draft/archived)")
	portfolioListCmd.Flags().BoolVar(&portfolioListFeatured,    "featured",       false,   "Show only featured projects")
	portfolioListCmd.Flags().StringVarP(&portfolioListFormat,   "format",   "f", "table",  "Output format: table or json")

	portfolioAddCmd.Flags().StringVarP(&addName,        "name",        "n", "",       "Project name (required)")
	portfolioAddCmd.Flags().StringVarP(&addDescription, "description", "d", "",       "Short description (required)")
	portfolioAddCmd.Flags().StringVarP(&addType,        "type",        "t", "",       "Project type (required)")
	portfolioAddCmd.Flags().StringArrayVar(&addTags,    "tags",              nil,     "Tags (repeatable)")
	portfolioAddCmd.Flags().StringVar(&addGithub,       "github",            "",      "GitHub URL")
	portfolioAddCmd.Flags().StringVar(&addStatus,       "status",            "active","Status: active/draft/archived")
	portfolioAddCmd.Flags().BoolVar(&addPublished,      "published",         true,    "Published (default true)")
	portfolioAddCmd.Flags().BoolVar(&addFeatured,       "featured",          false,   "Featured")
	portfolioAddCmd.Flags().StringVar(&addFromFile,     "from-file",         "",      "Load from JSON file")

	portfolioUpdateCmd.Flags().StringVarP(&addName,        "name",        "n", "", "New name")
	portfolioUpdateCmd.Flags().StringVarP(&addDescription, "description", "d", "", "New description")
	portfolioUpdateCmd.Flags().StringVar(&addStatus,       "status",            "", "New status")
	portfolioUpdateCmd.Flags().StringVar(&addGithub,       "github",            "", "New GitHub URL")
	portfolioUpdateCmd.Flags().StringArrayVar(&addTags,    "tags",              nil, "Replace tags")

	portfolioRemoveCmd.Flags().BoolVarP(&removeYes, "yes", "y", false, "Skip confirmation")
	portfolioFeatureCmd.Flags().BoolVar(&featureOff, "off", false, "Unfeature the project")
	portfolioExportCmd.Flags().StringVarP(&exportOutput, "output", "o", "portfolio-export.json", "Output file path")

	portfolioCmd.AddCommand(
		portfolioListCmd, portfolioAddCmd, portfolioUpdateCmd,
		portfolioRemoveCmd, portfolioPublishCmd, portfolioUnpublishCmd,
		portfolioFeatureCmd, portfolioExportCmd,
	)
}
