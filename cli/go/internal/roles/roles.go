// Package roles defines the NexusConsult corporate role hierarchy and data-rating
// permission system. Mirrors the Python CLI roles module exactly.
package roles

import "strings"

// DataRating describes a tier of allowed data sources.
type DataRating struct {
	Code           string
	Name           string
	Description    string
	AllowedSources []string
	DockerAIHint   string
}

// CorpRole is a single level in the corporate hierarchy.
type CorpRole struct {
	ID          int
	Name        string
	DisplayName string
	Level       int
	DataRating  string
	Description string
}

// CanAccessRating returns true if this role's tier includes the requested code.
func (r CorpRole) CanAccessRating(code string) bool {
	order := []string{"G", "PG", "PG-13", "R", "NC-17", "Unrated", "None"}
	own, req := -1, -1
	for i, c := range order {
		if c == r.DataRating {
			own = i
		}
		if c == code {
			req = i
		}
	}
	return own >= req
}

// Ratings is the complete set of data rating tiers.
var Ratings = map[string]DataRating{
	"G": {
		Code: "G", Name: "General Audiences",
		Description: "Public domain, open-access datasets only.",
		AllowedSources: []string{
			"Wikipedia / Wikimedia dumps",
			"Project Gutenberg (public domain books)",
			"US Government open data (data.gov)",
			"Common Crawl (filtered SFW subset)",
			"arXiv open-access papers (CS/Math/Physics)",
			"UCI ML Repository",
			"Hugging Face public datasets (G-tagged)",
		},
		DockerAIHint: "Use only openly licensed, non-sensitive, publicly available corpora. No personal data.",
	},
	"PG": {
		Code: "PG", Name: "Parental Guidance",
		Description: "News, academic papers, public social media.",
		AllowedSources: []string{
			"All G sources",
			"News APIs (NewsAPI, GDELT, MediaCloud)",
			"arXiv full corpus", "PubMed / MEDLINE abstracts",
			"Stack Overflow / Stack Exchange data dumps",
			"GitHub public repositories", "Reddit public posts",
			"Twitter/X public streaming API",
		},
		DockerAIHint: "Permitted to access mainstream public internet sources including news and forums.",
	},
	"PG-13": {
		Code: "PG-13", Name: "Parents Strongly Cautioned",
		Description: "Business data, industry reports, private-but-public APIs.",
		AllowedSources: []string{
			"All PG sources",
			"LinkedIn public profiles (via official API)",
			"Business registry data (SEC EDGAR, Companies House)",
			"Kaggle public competition datasets",
			"Financial data (Yahoo Finance, Alpha Vantage free tier)",
			"Patent databases (USPTO, EPO)",
			"GitHub private repos (with explicit owner consent)",
		},
		DockerAIHint: "May access semi-public business-oriented sources. Consent-based private repositories allowed.",
	},
	"R": {
		Code: "R", Name: "Restricted",
		Description: "Competitive intelligence, broad web crawling, proprietary APIs.",
		AllowedSources: []string{
			"All PG-13 sources",
			"Full Reddit corpus (including NSFW-tagged, non-illegal)",
			"Competitive product reviews and pricing scraping",
			"Proprietary API integrations (with license/key)",
			"Dark web indexed directories (read-only passive monitoring)",
			"Scrapy/Playwright unrestricted web crawling (SFW)",
		},
		DockerAIHint: "Broad unrestricted web crawling permitted. Passive dark-web directory indexing allowed.",
	},
	"NC-17": {
		Code: "NC-17", Name: "No Children Under 17",
		Description: "Unrestricted internet, paywalled academic, leaked-but-public datasets.",
		AllowedSources: []string{
			"All R sources",
			"Paywalled academic journals (via institutional access)",
			"Full unrestricted web crawling (NSFW allowed, illegal content excluded)",
			"Active dark-web forum indexing (read-only)",
			"Leaked public breach datasets (defensive use only)",
			"Synthetic data from generative pipelines at scale",
		},
		DockerAIHint: "Unrestricted internet including adult-rated content. Passive dark-web indexing allowed.",
	},
	"Unrated": {
		Code: "Unrated", Name: "Unrated / Executive",
		Description: "All above plus active dark-web access and restricted government data.",
		AllowedSources: []string{
			"All NC-17 sources",
			"Active dark-web market scraping (intelligence gathering)",
			"Restricted government databases (with MOU)",
			"OSINT full-spectrum (Shodan, Censys, etc.)",
			"Medical record de-identified bulk datasets",
		},
		DockerAIHint: "Full active dark-web access for intelligence purposes. Government-restricted data with proper agreements.",
	},
	"None": {
		Code: "None", Name: "No Restrictions — Creator",
		Description: "Absolute zero restrictions. All data sources permitted.",
		AllowedSources: []string{"EVERYTHING — no source restrictions apply at this role level"},
		DockerAIHint:   "Zero restrictions. Access any data source, format, or collection method.",
	},
}

// AllRoles is the complete corporate role table, indexed by level ID (1–8).
var AllRoles = map[int]CorpRole{
	1: {1, "user",      "User",               1, "G",       "Entry-level. Read-only public data access only."},
	2: {2, "worker",    "Worker / Developer",  2, "PG",      "Developers with access to news, academic, and public social data."},
	3: {3, "lead",      "Team Lead",           3, "PG-13",   "Leads with access to business data, industry reports, and semi-private APIs."},
	4: {4, "manager",   "Manager",             4, "R",       "Managers with broad crawling rights and competitive intelligence access."},
	5: {5, "director",  "Director",            5, "NC-17",   "Directors with unrestricted web access and passive dark-web indexing."},
	6: {6, "executive", "Executive",           6, "Unrated", "Executives with full OSINT and restricted government data access."},
	7: {7, "owner",     "Owner",               7, "Unrated", "Owners — equivalent to executive; grooms next creator."},
	8: {8, "creator",   "Creator",             8, "None",    "Creator — zero restrictions, full system sovereignty."},
}

// ByName returns a role by its machine name (case-insensitive).
func ByName(name string) (CorpRole, bool) {
	lower := strings.ToLower(name)
	for _, r := range AllRoles {
		if r.Name == lower {
			return r, true
		}
	}
	return CorpRole{}, false
}

// Sorted returns roles in ascending level order.
func Sorted() []CorpRole {
	out := make([]CorpRole, 0, len(AllRoles))
	for i := 1; i <= len(AllRoles); i++ {
		if r, ok := AllRoles[i]; ok {
			out = append(out, r)
		}
	}
	return out
}

// RatingOrder returns the ordered slice of rating codes, lowest to highest.
func RatingOrder() []string {
	return []string{"G", "PG", "PG-13", "R", "NC-17", "Unrated", "None"}
}
