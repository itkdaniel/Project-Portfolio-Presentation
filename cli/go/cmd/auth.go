package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/nexusconsult/nexus-cli/internal/client"
	"github.com/nexusconsult/nexus-cli/internal/config"
	"github.com/nexusconsult/nexus-cli/internal/roles"
	"github.com/olekukonko/tablewriter"
	"github.com/spf13/cobra"
	"os"
	"strconv"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication, session management, and role hierarchy",
	Long: `Manage authentication tokens, view session info, and inspect the
corporate role hierarchy with its associated data-access permissions.`,
}

// ── login ─────────────────────────────────────────────────────────────────────

var (
	loginEmail    string
	loginPassword string
	loginAPIURL   string
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate and store JWT token",
	Long: `Authenticate with the NexusConsult API and store the JWT token
in ~/.nexus/config.json for subsequent commands.

Examples:
  nexus auth login
  nexus auth login -e admin@nexusconsult.dev -p "Admin@Nexus2024!"
  nexus auth login --api-url http://prod.example.com`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if loginAPIURL != "" {
			_ = config.Save(map[string]interface{}{"api_url": loginAPIURL})
		}
		if loginEmail == "" {
			fmt.Print("Email: ")
			fmt.Scan(&loginEmail)
		}
		if loginPassword == "" {
			fmt.Print("Password: ")
			fmt.Scan(&loginPassword)
		}

		var resp map[string]interface{}
		err := client.Post("/api/auth/login", map[string]string{
			"email": loginEmail, "password": loginPassword,
		}, &resp)
		if err != nil {
			return fmt.Errorf("login failed: %w", err)
		}

		tok   := resp["token"].(string)
		user  := resp["user"].(map[string]interface{})
		email := user["email"].(string)
		role  := user["role"].(string)

		roleID := 1
		if rid, ok := user["corpRoleId"]; ok && rid != nil {
			switch v := rid.(type) {
			case float64:
				roleID = int(v)
			}
		}
		_ = config.Save(map[string]interface{}{
			"token": tok, "username": email, "role_id": roleID,
		})

		fmt.Printf("%s Logged in as %s\n", green("✓"), cyan(email))
		fmt.Printf("  Platform role : %s\n", role)
		if cr, ok := roles.AllRoles[roleID]; ok {
			fmt.Printf("  Corp role     : %s (level %d)\n", cyan(cr.DisplayName), roleID)
			fmt.Printf("  Data rating   : %s\n", cr.DataRating)
		}
		return nil
	},
}

// ── logout ────────────────────────────────────────────────────────────────────

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Clear stored credentials",
	Long: `Remove the stored JWT token and username from ~/.nexus/config.json.

Example:
  nexus auth logout`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := config.Clear(); err != nil {
			return err
		}
		fmt.Println(green("✓") + " Logged out. Token cleared.")
		return nil
	},
}

// ── whoami ────────────────────────────────────────────────────────────────────

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Display current session and role info",
	Long: `Show the authenticated user's profile, platform role, corporate role,
and data-access tier.

Example:
  nexus auth whoami`,
	RunE: func(cmd *cobra.Command, args []string) error {
		var resp map[string]interface{}
		if err := client.Get("/api/auth/me", &resp); err != nil {
			return fmt.Errorf("not authenticated or token expired: %w", err)
		}
		roleID := 1
		if rid, ok := resp["corpRoleId"]; ok && rid != nil {
			if v, ok2 := rid.(float64); ok2 {
				roleID = int(v)
			}
		}
		cr := roles.AllRoles[roleID]

		t := tablewriter.NewWriter(os.Stdout)
		t.SetBorder(true)
		t.SetHeader([]string{"Field", "Value"})
		t.Append([]string{"Email",         fmt.Sprintf("%v", resp["email"])})
		t.Append([]string{"Username",      fmt.Sprintf("%v", resp["username"])})
		t.Append([]string{"Platform role", fmt.Sprintf("%v", resp["role"])})
		t.Append([]string{"Corp role",     fmt.Sprintf("%s (level %d)", cr.DisplayName, roleID)})
		t.Append([]string{"Data rating",   cr.DataRating})
		t.Append([]string{"API URL",       config.Load().APIURL})
		t.Render()
		return nil
	},
}

// ── token ─────────────────────────────────────────────────────────────────────

var tokenCmd = &cobra.Command{
	Use:   "token",
	Short: "Print stored JWT token (for scripting)",
	Long: `Print the stored JWT token to stdout. Useful for shell scripting.

Examples:
  nexus auth token
  TOKEN=$(nexus auth token)
  curl -H "Authorization: Bearer $(nexus auth token)" /api/admin/stats`,
	RunE: func(cmd *cobra.Command, args []string) error {
		tok := config.Load().Token
		if tok == "" {
			return fmt.Errorf("no token stored — run: nexus auth login")
		}
		fmt.Println(tok)
		return nil
	},
}

// ── roles ─────────────────────────────────────────────────────────────────────

var rolesDetailID int

var rolesCmd = &cobra.Command{
	Use:   "roles",
	Short: "List corporate role hierarchy and data-access permissions",
	Long: `Display the full corporate role ladder (1=User → 8=Creator) with
the data-rating tier each level is permitted to access.

Examples:
  nexus auth roles
  nexus auth roles --id 4`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if rolesDetailID > 0 {
			r, ok := roles.AllRoles[rolesDetailID]
			if !ok {
				return fmt.Errorf("no role with ID %d", rolesDetailID)
			}
			rating, ok2 := roles.Ratings[r.DataRating]
			if !ok2 {
				return fmt.Errorf("unknown rating: %s", r.DataRating)
			}
			fmt.Printf("\n%s Role #%d — %s\n", bold("▶"), r.ID, cyan(r.DisplayName))
			fmt.Printf("  Data rating : %s — %s\n", r.DataRating, rating.Name)
			fmt.Printf("  Description : %s\n\n", r.Description)
			fmt.Println(bold("Allowed data sources:"))
			for _, s := range rating.AllowedSources {
				fmt.Printf("  %s %s\n", green("•"), s)
			}
			fmt.Printf("\n%s %s\n\n", dim("Docker AI hint:"), rating.DockerAIHint)
			return nil
		}

		t := tablewriter.NewWriter(os.Stdout)
		t.SetHeader([]string{"ID", "Role", "Data Rating", "Description"})
		t.SetBorder(true)
		for _, r := range roles.Sorted() {
			t.Append([]string{
				strconv.Itoa(r.ID),
				r.DisplayName,
				r.DataRating,
				r.Description,
			})
		}
		t.Render()
		fmt.Printf("\n%s\n\n", dim("Run `nexus auth roles --id N` for full allowed-sources."))
		return nil
	},
}

// ── set-role ──────────────────────────────────────────────────────────────────

var setRoleCmd = &cobra.Command{
	Use:   "set-role <email> <role-id>",
	Short: "Update a user's corporate role (admin/owner/creator only)",
	Long: `Update the corporate role of a user identified by email.
ROLE-ID must be an integer from 1 (user) to 8 (creator).

Requires admin, owner, or creator platform role.

Examples:
  nexus auth set-role alice@company.com 3
  nexus auth set-role bob@company.com 8`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		email  := args[0]
		roleID, err := strconv.Atoi(args[1])
		if err != nil || roleID < 1 || roleID > 8 {
			return fmt.Errorf("role-id must be 1–8")
		}
		err = client.Patch("/api/users/role",
			map[string]interface{}{"email": email, "corpRoleId": roleID}, nil)
		if err != nil {
			return err
		}
		cr := roles.AllRoles[roleID]
		fmt.Printf("%s Updated %s → role %d (%s)\n", green("✓"), cyan(email), roleID, cr.DisplayName)
		return nil
	},
}

func init() {
	loginCmd.Flags().StringVarP(&loginEmail,    "email",    "e", "", "Account email address")
	loginCmd.Flags().StringVarP(&loginPassword, "password", "p", "", "Account password")
	loginCmd.Flags().StringVarP(&loginAPIURL,   "api-url",  "u", "", "Override API base URL")
	rolesCmd.Flags().IntVar(&rolesDetailID,      "id",           0,  "Show detail for role ID")

	authCmd.AddCommand(loginCmd, logoutCmd, whoamiCmd, tokenCmd, rolesCmd, setRoleCmd)
}
