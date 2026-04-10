package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
)

const composeFile = "docker-compose.yml"

var infraCmd = &cobra.Command{
	Use:   "infra",
	Short: "Docker Compose and Kubernetes infrastructure lifecycle management",
}

func runCmd(args ...string) error {
	fmt.Printf("%s $ %s\n", dim("→"), strings.Join(args, " "))
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// ── start ─────────────────────────────────────────────────────────────────────

var (
	startDev     bool
	startBuild   bool
	startService string
)

var infraStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start all Docker Compose services",
	Long: `Start NexusConsult services via Docker Compose.

Examples:
  nexus infra start
  nexus infra start --dev
  nexus infra start --build
  nexus infra start --service web`,
	RunE: func(cmd *cobra.Command, args []string) error {
		c := []string{"docker", "compose", "-f", composeFile}
		if startDev {
			c = append(c, "-f", "docker-compose.dev.yml")
		}
		c = append(c, "up", "-d")
		if startBuild { c = append(c, "--build") }
		if startService != "" { c = append(c, startService) }
		return runCmd(c...)
	},
}

// ── stop ──────────────────────────────────────────────────────────────────────

var stopService string
var infraStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop running services",
	Long:  "Examples:\n  nexus infra stop\n  nexus infra stop --service ai-service",
	RunE: func(cmd *cobra.Command, args []string) error {
		c := []string{"docker", "compose", "-f", composeFile, "stop"}
		if stopService != "" { c = append(c, stopService) }
		return runCmd(c...)
	},
}

// ── restart ───────────────────────────────────────────────────────────────────

var restartService string
var infraRestartCmd = &cobra.Command{
	Use:   "restart",
	Short: "Restart services",
	Long:  "Examples:\n  nexus infra restart\n  nexus infra restart --service web",
	RunE: func(cmd *cobra.Command, args []string) error {
		c := []string{"docker", "compose", "-f", composeFile, "restart"}
		if restartService != "" { c = append(c, restartService) }
		return runCmd(c...)
	},
}

// ── scale ─────────────────────────────────────────────────────────────────────

var infraScaleCmd = &cobra.Command{
	Use:   "scale <service> <replicas>",
	Short: "Scale a service to N replicas",
	Long:  "Examples:\n  nexus infra scale web 3\n  nexus infra scale python-service 5",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("docker", "compose", "-f", composeFile, "scale", args[0]+"="+args[1])
	},
}

// ── status ────────────────────────────────────────────────────────────────────

var infraStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show container status",
	Long:  "Example:\n  nexus infra status",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("docker", "compose", "-f", composeFile, "ps")
	},
}

// ── logs ──────────────────────────────────────────────────────────────────────

var (
	logsTail   int
	logsFollow bool
)

var infraLogsCmd = &cobra.Command{
	Use:   "logs <service>",
	Short: "View logs for a service",
	Long:  "Examples:\n  nexus infra logs web --tail 50\n  nexus infra logs ai-service --follow",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c := []string{"docker", "compose", "-f", composeFile, "logs", fmt.Sprintf("--tail=%d", logsTail)}
		if logsFollow { c = append(c, "-f") }
		c = append(c, args[0])
		return runCmd(c...)
	},
}

// ── cleanup ───────────────────────────────────────────────────────────────────

var (
	cleanupVolumes bool
	cleanupYes     bool
)

var infraCleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Short: "Stop and remove containers, networks, optionally volumes",
	Long:  "Examples:\n  nexus infra cleanup\n  nexus infra cleanup --volumes --yes",
	RunE: func(cmd *cobra.Command, args []string) error {
		if !cleanupYes {
			msg := "Remove all containers?"
			if cleanupVolumes { msg = "Remove all containers AND volumes (data loss!)?" }
			fmt.Printf("%s [y/N]: ", msg)
			var c string
			fmt.Scan(&c)
			if strings.ToLower(c) != "y" { fmt.Println("Aborted."); return nil }
		}
		c := []string{"docker", "compose", "-f", composeFile, "down"}
		if cleanupVolumes { c = append(c, "-v") }
		return runCmd(c...)
	},
}

// ── build ─────────────────────────────────────────────────────────────────────

var (
	buildService string
	buildNoCache bool
)

var infraBuildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build Docker images",
	Long:  "Examples:\n  nexus infra build\n  nexus infra build --service ai-service --no-cache",
	RunE: func(cmd *cobra.Command, args []string) error {
		c := []string{"docker", "compose", "-f", composeFile, "build"}
		if buildNoCache { c = append(c, "--no-cache") }
		if buildService != "" { c = append(c, buildService) }
		return runCmd(c...)
	},
}

// ── k8s ───────────────────────────────────────────────────────────────────────

var k8sCmd = &cobra.Command{
	Use:   "k8s",
	Short: "Kubernetes cluster management",
}

var k8sApplyCmd = &cobra.Command{
	Use:  "apply",
	Short: "Apply K8s manifests",
	Long:  "Example:\n  nexus infra k8s apply",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("kubectl", "apply", "-f", "k8s")
	},
}

var k8sDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete K8s resources",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("kubectl", "delete", "-f", "k8s")
	},
}

var k8sStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show K8s pod status",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("kubectl", "get", "pods", "-n", "nexus", "-o", "wide")
	},
}

var k8sScaleCmd = &cobra.Command{
	Use:   "scale <deployment> <replicas>",
	Short: "Scale a K8s deployment",
	Long:  "Example:\n  nexus infra k8s scale web-deployment 5",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCmd("kubectl", "scale", "deployment", args[0], "--replicas="+args[1], "-n", "nexus")
	},
}

func init() {
	infraStartCmd.Flags().BoolVar(&startDev,         "dev",     false,  "Use dev compose override")
	infraStartCmd.Flags().BoolVarP(&startBuild,      "build",   "b",    false, "Rebuild images before start")
	infraStartCmd.Flags().StringVarP(&startService,  "service", "s",    "",    "Start specific service only")
	infraStopCmd.Flags().StringVarP(&stopService,    "service", "s",    "",    "Stop specific service only")
	infraRestartCmd.Flags().StringVarP(&restartService, "service", "s", "",    "Restart specific service")
	infraLogsCmd.Flags().IntVarP(&logsTail,          "tail",    "n",    100,   "Number of lines to show")
	infraLogsCmd.Flags().BoolVarP(&logsFollow,       "follow",  "f",    false, "Follow log output")
	infraCleanupCmd.Flags().BoolVarP(&cleanupVolumes,"volumes", "v",    false, "Also remove volumes")
	infraCleanupCmd.Flags().BoolVarP(&cleanupYes,    "yes",     "y",    false, "Skip confirmation")
	infraBuildCmd.Flags().StringVarP(&buildService,  "service", "s",    "",    "Build specific service")
	infraBuildCmd.Flags().BoolVar(&buildNoCache,     "no-cache",        false, "Disable build cache")

	k8sCmd.AddCommand(k8sApplyCmd, k8sDeleteCmd, k8sStatusCmd, k8sScaleCmd)
	infraCmd.AddCommand(infraStartCmd, infraStopCmd, infraRestartCmd, infraScaleCmd,
		infraStatusCmd, infraLogsCmd, infraCleanupCmd, infraBuildCmd, k8sCmd)
}
