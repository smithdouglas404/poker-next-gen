// Package apischema turns the annotated Go request structs into JSON Schema
// (Draft-07) so the frontend renders real forms instead of raw JSON textareas.
//
// The Go request structs are the SINGLE SOURCE OF TRUTH. Each form field carries
// additive struct tags that this reflector reads:
//
//	json:"field_name"          property name (and ,omitempty is ignored for schema)
//	server:"true"              server-controlled — EXCLUDED from the input schema
//	                           (ids, timestamps, is_active, status, etc.)
//	validate:"required,min=0,max=1000,minlen=2,maxlen=64"
//	                           required flag + numeric bounds + string length
//	enum:"member,admin"        allowed string values -> a <select>
//	unit:"money_minor|bps|percent|count|seconds|minutes"
//	                           semantic unit -> x-unit; drives MoneyInput / BasisPointsInput
//	ref:"club|user|tournament" entity reference -> x-ref; drives dropdown / typeahead pickers
//	label:"Small Blind"        human label -> title
//	help:"..."                 -> description
//
// The generator (cmd/schemagen) writes one file per RPC plus an index the
// frontend imports. Because the schema is generated from the exact struct the
// handler decodes, the form can never drift from what the backend accepts.
package apischema

import (
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Schema is a minimal JSON Schema (Draft-07) object. Field order in the emitted
// JSON is stabilized by MarshalJSON so regenerating without changes is a no-op.
type Schema struct {
	Schema      string             `json:"$schema,omitempty"`
	Title       string             `json:"title,omitempty"`
	Description string             `json:"description,omitempty"`
	Type        string             `json:"type,omitempty"`
	Properties  map[string]*Schema `json:"properties,omitempty"`
	Required    []string           `json:"required,omitempty"`
	Enum        []string           `json:"enum,omitempty"`
	Minimum     *float64           `json:"minimum,omitempty"`
	Maximum     *float64           `json:"maximum,omitempty"`
	MinLength   *int               `json:"minLength,omitempty"`
	MaxLength   *int               `json:"maxLength,omitempty"`
	Format      string             `json:"format,omitempty"`
	Default     interface{}        `json:"default,omitempty"`
	Examples    []interface{}      `json:"examples,omitempty"`
	// Extensions consumed by the form renderer.
	AdditionalProperties *bool  `json:"additionalProperties,omitempty"`
	XRPC                 string `json:"x-rpc,omitempty"`
	XUnit                string `json:"x-unit,omitempty"`
	XRef                 string `json:"x-ref,omitempty"`
	XOrder               int    `json:"x-order,omitempty"`
}

var timeType = reflect.TypeOf(time.Time{})

// ReflectRequest builds the input JSON Schema for a request struct. rpc is the
// registered RPC id (embedded as x-rpc); example, when non-nil, is attached as
// the schema's example so the form can prefill sensible defaults.
func ReflectRequest(rpc string, t reflect.Type, example map[string]interface{}) *Schema {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	s := objectSchema(t)
	s.Schema = "http://json-schema.org/draft-07/schema#"
	s.XRPC = rpc
	if s.Title == "" {
		s.Title = t.Name()
	}
	if example != nil {
		s.Examples = []interface{}{example}
	}
	return s
}

func objectSchema(t reflect.Type) *Schema {
	falsy := false
	s := &Schema{
		Type:                 "object",
		Properties:           map[string]*Schema{},
		AdditionalProperties: &falsy,
	}
	order := 0
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.PkgPath != "" { // unexported
			continue
		}
		name, ok := jsonName(f)
		if !ok {
			continue
		}
		// Server-controlled fields never appear in an input form.
		if strings.EqualFold(f.Tag.Get("server"), "true") {
			continue
		}
		prop := fieldSchema(f)
		prop.XOrder = order
		order++
		s.Properties[name] = prop
		if hasValidateToken(f, "required") {
			s.Required = append(s.Required, name)
		}
	}
	sort.Strings(s.Required)
	return s
}

func fieldSchema(f reflect.StructField) *Schema {
	s := &Schema{}
	ft := f.Type
	for ft.Kind() == reflect.Ptr {
		ft = ft.Elem()
	}

	// time.Time -> ISO-8601 string.
	if ft == timeType {
		s.Type = "string"
		s.Format = "date-time"
	} else {
		switch ft.Kind() {
		case reflect.String:
			s.Type = "string"
		case reflect.Bool:
			s.Type = "boolean"
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
			reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			s.Type = "integer"
		case reflect.Float32, reflect.Float64:
			s.Type = "number"
		default:
			s.Type = "string"
		}
	}

	if label := f.Tag.Get("label"); label != "" {
		s.Title = label
	}
	if help := f.Tag.Get("help"); help != "" {
		s.Description = help
	}
	if unit := f.Tag.Get("unit"); unit != "" {
		s.XUnit = unit
	}
	if ref := f.Tag.Get("ref"); ref != "" {
		s.XRef = ref
	}
	if enum := f.Tag.Get("enum"); enum != "" {
		for _, v := range strings.Split(enum, ",") {
			if v = strings.TrimSpace(v); v != "" {
				s.Enum = append(s.Enum, v)
			}
		}
	}
	applyValidate(f, s)
	return s
}

// applyValidate parses the comma-separated validate tag into schema bounds.
func applyValidate(f reflect.StructField, s *Schema) {
	for _, tok := range strings.Split(f.Tag.Get("validate"), ",") {
		tok = strings.TrimSpace(tok)
		if tok == "" || tok == "required" {
			continue
		}
		key, val, found := strings.Cut(tok, "=")
		if !found {
			continue
		}
		switch key {
		case "min":
			if n, err := strconv.ParseFloat(val, 64); err == nil {
				s.Minimum = &n
			}
		case "max":
			if n, err := strconv.ParseFloat(val, 64); err == nil {
				s.Maximum = &n
			}
		case "minlen":
			if n, err := strconv.Atoi(val); err == nil {
				s.MinLength = &n
			}
		case "maxlen":
			if n, err := strconv.Atoi(val); err == nil {
				s.MaxLength = &n
			}
		}
	}
}

func hasValidateToken(f reflect.StructField, want string) bool {
	for _, tok := range strings.Split(f.Tag.Get("validate"), ",") {
		if strings.TrimSpace(tok) == want {
			return true
		}
	}
	return false
}

// jsonName returns the JSON property name for a field, or ok=false when the
// field is skipped (json:"-").
func jsonName(f reflect.StructField) (string, bool) {
	tag := f.Tag.Get("json")
	if tag == "-" {
		return "", false
	}
	name := f.Name
	if tag != "" {
		if comma := strings.IndexByte(tag, ','); comma >= 0 {
			if comma > 0 {
				name = tag[:comma]
			}
		} else {
			name = tag
		}
	}
	if name == "" {
		name = f.Name
	}
	return name, true
}
