import { FoldingRange } from 'vscode-languageserver/node';
import { TableConstructorExpression, TableKey, TableKeyString } from './expressions';
import {
  AssignmentStatement,
  DoStatement,
  ForGenericStatement,
  ForNumericStatement,
  FunctionDeclaration,
  IfStatement,
  LocalStatement,
  RepeatStatement,
  WhileStatement,
} from './statements';
import { ASTVisitor } from './visitor';

export class FoldingRangeVisitor extends ASTVisitor<void> {
  public ranges: FoldingRange[] = [];
  private seen = new Set<string>();

  createDefaultScope(): void {
    // This visitor doesn't manage scope, so this is a no-op.
    return;
  }

  private addExplicitRange(startLine: number, endLine: number) {
    // LSP lines are 0-based, parser lines are 1-based
    const s = startLine - 1;
    const e = endLine - 1;
    const key = `${s}-${e}`;
    if (s < e && !this.seen.has(key)) {
      this.seen.add(key);
      this.ranges.push({ startLine: s, endLine: e });
    }
  }

  override visitLocalStatement(node: LocalStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitAssignmentStatement(node: AssignmentStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitIfStatement(node: IfStatement): void {
    if (node.loc) {
      for (let i = 0; i < node.clauses.length; i++) {
        const currentClause = node.clauses[i];
        const nextClause = (i + 1 < node.clauses.length) ? node.clauses[i+1] : null;

        if (!currentClause.loc) {
          continue;
        }

        const startLine = currentClause.loc.start.line;
        let endLine;

        if (nextClause && nextClause.loc) {
        // End one line before the next clause starts
          endLine = nextClause.loc.start.line - 1;
        } else {
        // This is the last clause, so it ends where the whole IfStatement ends,
        // which is one line above the final 'end' keyword.
          endLine = node.loc.end.line - 1;
        }

        this.addExplicitRange(startLine, endLine);
      }
    }
  }

  override visitWhileStatement(node: WhileStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitDoStatement(node: DoStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitRepeatStatement(node: RepeatStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitForNumericStatement(node: ForNumericStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitForGenericStatement(node: ForGenericStatement): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitTableConstructorExpression(node: TableConstructorExpression): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitTableKeyString(node: TableKeyString): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }

  override visitTableKey(node: TableKey): void {
    if (node.loc) {
      this.addExplicitRange(node.loc.start.line, node.loc.end.line);
    }
  }
}
