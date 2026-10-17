/**
 * LLM authoring lands in Phase 3. The boundary exists in Phase 1 so the player
 * and compiler depend on the artifact, never on a model provider.
 */
export interface AuthoringContract {
  readonly phase: 3;
}
