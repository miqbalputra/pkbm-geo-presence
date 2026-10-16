package migrations

import "testing"

func TestSplitStatements(t *testing.T) {
	statements := splitStatements("CREATE TABLE a (id INT);\n\nCREATE TABLE b (id INT);")
	if len(statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(statements))
	}
}
