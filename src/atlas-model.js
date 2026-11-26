// A read-only projection of the repository baseline; browser workspaces are separate.
export function caseGraph(dataset, priority) {
  const claims = dataset.evidence.filter((item) =>
    priority.evidenceIds.includes(item.id),
  );
  const sourceIds = new Set(claims.flatMap((item) => item.sourceIds));
  const sources = dataset.sources.filter((item) => sourceIds.has(item.id));
  const decisions = dataset.decisions.filter(
    (item) => item.priorityId === priority.id,
  );
  const nodes = [];
  const edges = [];
  for (const item of sources) {
    nodes.push({
      id: item.id,
      name: item.publisher,
      kind: "Source",
      description: [
        item.title,
        item.dateNote,
        "Accessed " + item.accessedAt + ".",
      ].join(" "),
      url: item.url,
    });
  }
  for (const item of claims) {
    nodes.push({
      id: item.id,
      name: item.id,
      kind: "Evidence",
      description: [item.statement, item.scope, item.independentCheck].join(
        " ",
      ),
    });
    for (const source of item.sourceIds) {
      edges.push({
        from: source,
        to: item.id,
        relation: item.sourceRole.replaceAll("_", " "),
      });
    }
    edges.push({ from: item.id, to: priority.id, relation: "cited by" });
  }
  nodes.push({
    id: priority.id,
    name: priority.lane,
    kind: "Investigation",
    description: [
      priority.title,
      priority.thesis,
      priority.confidenceReason,
    ].join(" "),
  });
  for (const item of decisions) {
    nodes.push({
      id: item.id,
      name: item.id,
      kind: "Decision",
      description: [item.proposal, item.status + ".", item.rationale].join(" "),
    });
    edges.push({ from: priority.id, to: item.id, relation: "reviewed in" });
  }
  return {
    id: priority.id,
    name: priority.title,
    version: dataset.meta.version,
    nodes,
    edges,
  };
}
