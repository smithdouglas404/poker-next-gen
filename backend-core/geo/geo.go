// Package geo resolves a client IP to an ISO country code for jurisdiction
// gating. Lookups are best-effort and cached: a provider outage or a
// private/loopback IP resolves to "" (unknown), which the caller treats as
// allowed unless a manual rule says otherwise — so a provider failure never
// bricks play, while explicit country rules are always honored.
package geo

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type cacheEntry struct {
	country string
	at      time.Time
}

var (
	mu    sync.Mutex
	cache = map[string]cacheEntry{}
	// cacheTTL keeps a resolved country for a while; IP→country is stable enough
	// that re-querying the provider on every action would be wasteful.
	cacheTTL = 6 * time.Hour
	client   = &http.Client{Timeout: 4 * time.Second}
)

// Country returns the uppercase ISO-3166 alpha-2 country for an IP, or "" when
// unknown (private/loopback IP, provider not reachable, or lookup disabled).
func Country(ctx context.Context, ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ""
	}
	// Strip a port if the caller passed host:port.
	if h, _, err := net.SplitHostPort(ip); err == nil {
		ip = h
	}
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsLinkLocalUnicast() {
		return "" // local/dev traffic is never geo-gated
	}

	mu.Lock()
	if e, ok := cache[ip]; ok && time.Since(e.at) < cacheTTL {
		c := e.country
		mu.Unlock()
		return c
	}
	mu.Unlock()

	country := lookup(ctx, ip)

	mu.Lock()
	cache[ip] = cacheEntry{country: country, at: time.Now()}
	mu.Unlock()
	return country
}

// lookup queries the configured provider. IPINFO_TOKEN → ipinfo.io; otherwise
// the keyless ipapi.co endpoint. Both return a bare 2-letter code.
func lookup(ctx context.Context, ip string) string {
	var url string
	if token := os.Getenv("IPINFO_TOKEN"); token != "" {
		url = "https://ipinfo.io/" + ip + "/country?token=" + token
	} else if base := os.Getenv("GEO_PROVIDER_URL"); base != "" {
		url = strings.ReplaceAll(base, "{ip}", ip)
	} else {
		url = "https://ipapi.co/" + ip + "/country/"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return ""
	}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return ""
	}
	code := strings.ToUpper(strings.TrimSpace(string(body)))
	if len(code) != 2 {
		return ""
	}
	return code
}
