import type { ContextPack, AnchorCandidate } from './context.js';
import { FakeGuideModel } from './fake-model.js';
import type { GuideModel } from './model.js';
import type { ChapterDraft, ChapterPlan, TourPlan } from './schemas.js';

function candidateAt(context: ContextPack, index: number): AnchorCandidate {
  const candidate = context.candidates[index % Math.max(1, context.candidates.length)];
  if (!candidate) {
    throw new Error('the context pack has no anchor candidates');
  }
  return candidate;
}

function chapterPlan(title: string, summary: string, goal: string): ChapterPlan {
  return {
    title,
    summary,
    goal,
    beatBudget: 2,
    coverage: ['a named entry point', 'one responsibility and its boundary'],
  };
}

function shortLabel(candidate: AnchorCandidate): string {
  return candidate.label.split('.').pop()?.slice(0, 40) ?? 'Module';
}

function chapterDraft(
  context: ContextPack,
  chapter: ChapterPlan,
  index: number,
): ChapterDraft {
  const first = candidateAt(context, index * 2);
  const second = candidateAt(context, index * 2 + 1);
  const nodeA = `node_${index}_a`;
  const nodeB = `node_${index}_b`;
  const edge = `edge_${index}`;
  const label = shortLabel;

  return {
    title: chapter.title,
    summary: chapter.summary,
    diagram: {
      id: `diagram_fixture_${index}`,
      kind: 'architecture',
      title: chapter.title,
      nodes: [
        {
          id: nodeA,
          label: label(first),
          type: 'class',
          anchorId: first.id,
        },
        {
          id: nodeB,
          label: label(second),
          type: 'module',
          anchorId: second.id,
        },
      ],
      edges: [
        {
          id: edge,
          from: nodeA,
          to: nodeB,
          kind: 'calls',
        },
      ],
    },
    beats: [
      {
        title: 'The declaration',
        narration: `This chapter starts with ${label(first)}. The cited excerpt is the declaration the tour can point to, and it gives the reader a concrete place to stand before the explanation moves on. The goal is to name the responsibility without claiming more than the evidence shows.`,
        anchorIds: [first.id],
        nodeIds: [nodeA],
        edgeIds: [],
        suggestedQuestions: [`What does ${label(first)} own?`],
      },
      {
        title: 'The hand-off',
        narration: `The next step is the boundary around ${label(second)}. The excerpt shows the neighbouring declaration, so the reader can compare the two responsibilities and see where the code hands work from one part of the project to the other. The chapter ends here; the next chapter can go deeper without repeating this ground.`,
        anchorIds: [second.id],
        nodeIds: [nodeB],
        edgeIds: [edge],
        suggestedQuestions: [`Why is ${label(second)} separate?`],
      },
    ],
  };
}

/**
 * A deterministic model used by tests and the CLI's `--model fixture` mode. It
 * exercises the real pipeline end to end without a provider key. It is not a
 * substitute for a reviewed model-generated tour.
 */
export function createFixtureGuideModel(context: ContextPack): GuideModel {
  if (context.candidates.length === 0) {
    throw new Error('cannot build a fixture tour without anchor candidates');
  }

  const plan: TourPlan = {
    title: context.brief.project.name,
    subtitle: 'A deterministic fixture tour built from cited declarations.',
    audience: 'new-contributor',
    chapters: [
      chapterPlan(
        'The shape of the project',
        'The first responsibility and the context around it.',
        'Name the project and its first cited declaration.',
      ),
      chapterPlan(
        'The working parts',
        'A second responsibility and the boundary beside it.',
        'Show how two parts of the project sit next to each other.',
      ),
      chapterPlan(
        'The boundaries',
        'A third responsibility and the seam that keeps it local.',
        'Name a seam between two cited declarations.',
      ),
      chapterPlan(
        'Where to go next',
        'A final entry point and a suggestion for further reading.',
        'Leave the reader with one concrete next step.',
      ),
    ],
  };

  let chapterIndex = 0;
  return new FakeGuideModel(({ schemaName }) => {
    if (schemaName === 'TourPlan') {
      return plan;
    }
    if (schemaName === 'ChapterDraft') {
      const chapter = plan.chapters[chapterIndex] ?? plan.chapters[0];
      chapterIndex += 1;
      if (!chapter) {
        throw new Error('fixture plan has no chapters');
      }
      return chapterDraft(context, chapter, chapterIndex - 1);
    }
    throw new Error(`fixture model cannot answer schema ${schemaName}`);
  }, 'fixture');
}
