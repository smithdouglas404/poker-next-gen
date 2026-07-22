package apischema

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestServerFieldsExcluded proves server-controlled fields never leak into an
// input schema (a form must not ask the operator for an id/timestamp/status).
func TestServerFieldsExcluded(t *testing.T) {
	serverish := map[string]bool{
		"id": true, "created_at": true, "updated_at": true,
		"is_active": true, "status": true, "created_by": true,
		"locked_amount": true,
	}
	for rpc, s := range Build() {
		for name := range s.Properties {
			if serverish[name] {
				t.Errorf("%s: server-controlled field %q leaked into the input schema", rpc, name)
			}
		}
	}
}

// TestExampleMatchesSchema is the contract test: every registry example is a
// valid submission against its own generated schema — required present, enums
// honored, bounds respected, no unexpected keys. If a struct and its example
// drift, this fails.
func TestExampleMatchesSchema(t *testing.T) {
	for _, e := range Registry {
		if e.Example == nil {
			continue
		}
		s := ReflectRequest(e.RPC, e.Type, e.Example)

		// Required fields present.
		for _, req := range s.Required {
			if _, ok := e.Example[req]; !ok {
				t.Errorf("%s: example missing required field %q", e.RPC, req)
			}
		}
		// Every example key is a known (non-server) property.
		for k := range e.Example {
			if _, ok := s.Properties[k]; !ok {
				t.Errorf("%s: example key %q is not an input property (server field or typo)", e.RPC, k)
			}
		}
		// Enum / bounds validation per property.
		for k, v := range e.Example {
			p := s.Properties[k]
			if p == nil {
				continue
			}
			if len(p.Enum) > 0 {
				if sv, ok := v.(string); ok && !contains(p.Enum, sv) {
					t.Errorf("%s.%s: example value %q not in enum %v", e.RPC, k, sv, p.Enum)
				}
			}
			if n, ok := asFloat(v); ok {
				if p.Minimum != nil && n < *p.Minimum {
					t.Errorf("%s.%s: example %v below minimum %v", e.RPC, k, n, *p.Minimum)
				}
				if p.Maximum != nil && n > *p.Maximum {
					t.Errorf("%s.%s: example %v above maximum %v", e.RPC, k, n, *p.Maximum)
				}
			}
		}
	}
}

// TestSchemaShape sanity-checks the structural invariants the renderer relies on.
func TestSchemaShape(t *testing.T) {
	for rpc, s := range Build() {
		if s.Type != "object" {
			t.Errorf("%s: root type = %q, want object", rpc, s.Type)
		}
		if s.XRPC != rpc {
			t.Errorf("%s: x-rpc = %q", rpc, s.XRPC)
		}
		if s.AdditionalProperties == nil || *s.AdditionalProperties {
			t.Errorf("%s: additionalProperties must be false", rpc)
		}
		if len(s.Properties) == 0 {
			t.Errorf("%s: no input properties", rpc)
		}
		// Money/bps units must land on integer fields (minor units / basis points).
		for name, p := range s.Properties {
			if (p.XUnit == "money_minor" || p.XUnit == "bps") && p.Type != "integer" {
				t.Errorf("%s.%s: unit %q on non-integer type %q", rpc, name, p.XUnit, p.Type)
			}
		}
	}
}

// TestMarshalStable ensures the schema serializes to valid JSON (the generator
// writes exactly this).
func TestMarshalStable(t *testing.T) {
	for rpc, s := range Build() {
		b, err := json.MarshalIndent(s, "", "  ")
		if err != nil {
			t.Fatalf("%s: marshal: %v", rpc, err)
		}
		if !strings.Contains(string(b), "\"x-rpc\": \""+rpc+"\"") {
			t.Errorf("%s: x-rpc not emitted", rpc)
		}
	}
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

func asFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}
