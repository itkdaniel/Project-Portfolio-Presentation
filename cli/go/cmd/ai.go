package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const aiBase = "http://localhost:8001"
const pyBase = "http://localhost:8000"

var aiCmd = &cobra.Command{
	Use:   "ai",
	Short: "AI inference — classify, embed, similarity, fill-mask, search",
}

func aiPost(path string, body map[string]interface{}) (map[string]interface{}, error) {
	data, _ := json.Marshal(body)
	resp, err := http.Post(aiBase+path, "application/json", strings.NewReader(string(data)))
	if err != nil {
		return nil, fmt.Errorf("AI service not reachable at %s — start with: nexus infra start", aiBase)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	_ = json.Unmarshal(b, &result)
	return result, nil
}

// ── classify ──────────────────────────────────────────────────────────────────

var classifyTopK int
var aiClassifyCmd = &cobra.Command{
	Use:   "classify <text>",
	Short: "Classify text with the deployed transformer",
	Long: `Examples:
  nexus ai classify "This service handles authentication and JWT tokens"
  nexus ai classify "Distributed event streaming" --top-k 5`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := aiPost("/classify", map[string]interface{}{"text": args[0], "top_k": classifyTopK})
		if err != nil { return err }
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ── embed ─────────────────────────────────────────────────────────────────────

var embedTruncate int
var aiEmbedCmd = &cobra.Command{
	Use:   "embed <text>",
	Short: "Generate a sentence embedding vector",
	Long:  "Example:\n  nexus ai embed \"Kubernetes horizontal pod autoscaler\"",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := aiPost("/embed", map[string]interface{}{"text": args[0]})
		if err != nil { return err }
		if vec, ok := result["embedding"].([]interface{}); ok {
			fmt.Printf("Embedding dim=%d\n", len(vec))
			preview := vec
			if len(preview) > embedTruncate { preview = preview[:embedTruncate] }
			parts := make([]string, len(preview))
			for i, v := range preview { parts[i] = fmt.Sprintf("%.5f", v) }
			fmt.Printf("Preview: [%s%s]\n", strings.Join(parts, ", "), func() string {
				if len(vec) > embedTruncate { return ",..." }
				return ""
			}())
		}
		return nil
	},
}

// ── similarity ────────────────────────────────────────────────────────────────

var aiSimilarityCmd = &cobra.Command{
	Use:   "similarity <text-a> <text-b>",
	Short: "Compute cosine similarity between two texts",
	Long:  "Example:\n  nexus ai similarity \"JWT authentication\" \"OAuth2 token validation\"",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := aiPost("/similarity", map[string]interface{}{"text_a": args[0], "text_b": args[1]})
		if err != nil { return err }
		score := 0.0
		if s, ok := result["similarity"].(float64); ok { score = s }
		quality := "low"
		if score > 0.7 { quality = "high" } else if score > 0.4 { quality = "medium" }
		fmt.Printf("Cosine similarity: %.4f (%s)\n", score, quality)
		return nil
	},
}

// ── fill-mask ─────────────────────────────────────────────────────────────────

var fillMaskTopK int
var aiFillMaskCmd = &cobra.Command{
	Use:   "fill-mask <text>",
	Short: "Fill [MASK] tokens using MLM",
	Long:  "Example:\n  nexus ai fill-mask \"The [MASK] service handles distributed [MASK] processing\"",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := aiPost("/fill-mask", map[string]interface{}{"text": args[0], "top_k": fillMaskTopK})
		if err != nil { return err }
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ── search ────────────────────────────────────────────────────────────────────

var (
	searchTopK  int
	searchTags  []string
)

var aiSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Semantic BM25 + embedding search over projects",
	Long: `Examples:
  nexus ai search "authentication microservice"
  nexus ai search "ML inference" --tags pytorch --tags docker`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		url := fmt.Sprintf("%s/search?q=%s&limit=%d", pyBase, args[0], searchTopK)
		if len(searchTags) > 0 {
			url += "&tags=" + strings.Join(searchTags, ",")
		}
		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			return fmt.Errorf("Python service not reachable at %s", pyBase)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		var result interface{}
		_ = json.Unmarshal(b, &result)
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ── status ────────────────────────────────────────────────────────────────────

var aiStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check AI and Python service health",
	Long:  "Example:\n  nexus ai status",
	RunE: func(cmd *cobra.Command, args []string) error {
		for _, svc := range []struct{ name, url string }{
			{"AI Service (PyTorch)", aiBase},
			{"Python Service (BM25)", pyBase},
		} {
			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Get(svc.url + "/health")
			if err != nil {
				fmt.Printf("  %s %s: %s (%v)\n", red("●"), svc.name, red("offline"), err)
				continue
			}
			defer resp.Body.Close()
			b, _ := io.ReadAll(resp.Body)
			var data map[string]interface{}
			_ = json.Unmarshal(b, &data)
			fmt.Printf("  %s %s: %s\n", green("●"), svc.name, green("online"))
			for k, v := range data {
				fmt.Printf("    %s: %v\n", dim(k), v)
			}
		}
		return nil
	},
}

func init() {
	aiClassifyCmd.Flags().IntVarP(&classifyTopK,  "top-k", "k", 3, "Top-K labels")
	aiEmbedCmd.Flags().IntVar(&embedTruncate,      "truncate",   8, "Preview first N dims")
	aiFillMaskCmd.Flags().IntVarP(&fillMaskTopK,   "top-k", "k", 5, "Top-K predictions")
	aiSearchCmd.Flags().IntVarP(&searchTopK,       "top-k", "k", 5, "Top-K results")
	aiSearchCmd.Flags().StringArrayVarP(&searchTags,"tags", "t", nil, "Filter by tags")

	aiCmd.AddCommand(aiClassifyCmd, aiEmbedCmd, aiSimilarityCmd,
		aiFillMaskCmd, aiSearchCmd, aiStatusCmd)
}
