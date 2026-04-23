// Display-only transform for report filenames.
//
// Gmail-ingested reports land in `reports.filename` with a
// `gmail_oyvindmiller_` prefix applied by the synthetic-PDF renderer. The
// raw filename is kept as-is in the DB so the file-on-disk lookup in
// `/api/reports/[id]/pdf` still resolves. Every UI surface that *shows*
// the filename to a human wraps the string through this function.
//
// Never apply this to a value that will be passed back to an API, a query
// parameter, or a file-path operation — the prefix is load-bearing there.
export function displayReportFilename(filename: string): string {
  return filename.replace(/^gmail_oyvindmiller_/, "");
}
