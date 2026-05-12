package envutil

import "testing"

func TestParseLines(t *testing.T) {
	raw := "# c\nFOO=1\nexport BAR=2\nBAZ=\"x y\"\nFOO=3\n"
	res := ParseLines(raw)
	if len(res.Vars) != 3 {
		t.Fatalf("want 3 keys, got %d: %#v", len(res.Vars), res.Vars)
	}
	if res.Vars["FOO"] != "3" {
		t.Fatalf("last FOO wins: got %q", res.Vars["FOO"])
	}
	if res.Vars["BAR"] != "2" {
		t.Fatalf("BAR: got %q", res.Vars["BAR"])
	}
	if res.Vars["BAZ"] != "x y" {
		t.Fatalf("BAZ: got %q", res.Vars["BAZ"])
	}
}

func TestNormalizeMapInvalidKey(t *testing.T) {
	res := NormalizeMap(map[string]string{"OK": "v", "9bad": "x", "": "y"})
	if len(res.Vars) != 1 || res.Vars["OK"] != "v" {
		t.Fatalf("got %#v", res.Vars)
	}
}
