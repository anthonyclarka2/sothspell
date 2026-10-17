/**
 * Repository analysis lands in Phase 2. Keeping the package boundary now makes
 * the future analyzer a real module instead of a folder that appears later in
 * the middle of the API.
 */
export interface AnalyzerContract {
  readonly phase: 2;
}
