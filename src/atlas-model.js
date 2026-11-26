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
    reviewedAt: priority.evidenceReviewedAt,
    nextAction: priority.nextAction,
    assumptions: priority.assumptions,
    disproves: priority.disproves,
    nodes,
    edges,
  };
}

export function compareCoverage(first, second) {
  const sources = (graph) =>
    graph.nodes.filter((node) => node.kind === "Source");
  const left = sources(first),
    right = sources(second);
  const contains = (records, id) => records.some((node) => node.id === id);
  const names = (records) =>
    records.map((node) => node.name + " (" + node.id + ")").join(", ") ||
    "None";
  const claims = (graph) =>
    graph.nodes.filter((node) => node.kind === "Evidence").length;
  return [
    [
      "Shared public sources",
      names(left.filter((node) => contains(right, node.id))),
    ],
    [
      first.name + " only",
      names(left.filter((node) => !contains(right, node.id))),
    ],
    [
      second.name + " only",
      names(right.filter((node) => !contains(left, node.id))),
    ],
    [
      "Claims cited",
      first.name +
        ": " +
        claims(first) +
        ". " +
        second.name +
        ": " +
        claims(second) +
        ".",
    ],
  ];
}

export function caseBrief(graph) {
  const lines = [
    "# " + graph.name,
    "",
    "Synthetic investigation " +
      graph.id +
      " · public baseline " +
      graph.version +
      " · evidence reviewed " +
      graph.reviewedAt,
    "",
    "## Next research action",
    graph.nextAction,
    "",
    "## Assumptions",
    ...graph.assumptions.map((a) => "- " + a),
    "",
    "## Disproof criteria",
    ...graph.disproves.map((a) => "- " + a),
    "",
    "## Evidence and citations",
  ];
  for (const claim of graph.nodes.filter((node) => node.kind === "Evidence")) {
    lines.push("", "### " + claim.id, claim.description);
    for (const edge of graph.edges.filter((edge) => edge.to === claim.id)) {
      const source = graph.nodes.find((node) => node.id === edge.from);
      lines.push(
        "- " +
          edge.relation +
          ": " +
          source.name +
          " (" +
          source.id +
          ") " +
          source.url,
      );
    }
  }
  return lines.join("\n") + "\n";
}
