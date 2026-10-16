package migrations

import (
	"strings"
	"testing"
)

func TestSplitStatements(t *testing.T) {
	statements := splitStatements("CREATE TABLE a (id INT);\n\nCREATE TABLE b (id INT);")
	if len(statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(statements))
	}
}

func TestSplitStatementsIgnoresSemicolonsInLineComments(t *testing.T) {
	statements := splitStatements(`-- Migration notes can contain semicolons;
-- the SQL below must remain one statement.
CREATE TABLE attendance_events (id INT);
-- A trailing comment; must not create an empty SQL statement.`)

	if len(statements) != 1 {
		t.Fatalf("expected 1 statement, got %d: %#v", len(statements), statements)
	}
	if strings.TrimSpace(statements[0]) != "CREATE TABLE attendance_events (id INT)" {
		t.Fatalf("unexpected statement: %q", statements[0])
	}
}
