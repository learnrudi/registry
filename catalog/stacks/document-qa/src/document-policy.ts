import { realpathSync, statSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

/** Approval comes from process configuration, never from MCP arguments. */
export function approvedDocumentPath(input: string): string {
  const file = realpathSync(resolve(input));
  const roots = (process.env.RUDI_DOCUMENT_QA_ROOTS || join(homedir(), '.rudi', 'outputs')).split(delimiter);
  const allowed = roots.some(root => {
    if (!root.trim()) return false;
    try {
      const within = relative(realpathSync(resolve(root)), file);
      return within !== '..' && !within.startsWith('..' + sep) && !isAbsolute(within);
    } catch { return false; }
  });
  if (!allowed) throw new Error('HTML document must be within an operator-approved root (RUDI_DOCUMENT_QA_ROOTS)');
  const stat = statSync(file);
  if (!['.html', '.htm'].includes(extname(file).toLowerCase()) || !stat.isFile() || stat.nlink !== 1 || stat.size > 10 * 1024 * 1024) {
    throw new Error('Document must be a regular, singly linked HTML file of at most 10 MiB');
  }
  return file;
}
