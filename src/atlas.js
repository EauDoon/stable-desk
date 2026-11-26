import { caseGraph, caseBrief, compareCoverage } from "./atlas-model.js";
import { graphCanvas } from "./atlas-canvas.js";

const el = (id) => document.getElementById(id);
const architecture = {
  id: "architecture",
  name: "Desk architecture",
  nodes: [],
  edges: [],
};
for (const row of document.querySelectorAll("#reference tbody tr")) {
  architecture.nodes.push({
    id: row.id,
    name: row.querySelector("th").textContent,
    kind: row.dataset.kind,
    description: row.querySelector("p").textContent.replace(/\s+/g, " ").trim(),
    url: row.querySelector("td a").getAttribute("href"),
  });
  for (const connection of row.querySelectorAll("[data-relation]")) {
    architecture.edges.push({
      from: row.id,
      to: connection.querySelector("a").hash.slice(1),
      relation: connection.dataset.relation,
    });
  }
}
const maps = new Map([[architecture.id, architecture]]);
const evidence = new Map();
let graph = architecture,
  selected = architecture.nodes[0];
const canvas = graphCanvas(document.querySelector("canvas"), choose);
const lens = el("lens"),
  find = el("find");
function linkFor(id) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ map: graph.id, record: id }).toString();
  return url;
}
function choose(id) {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node) return;
  const fromConnections = el("connections").contains(document.activeElement);
  selected = node;
  history.replaceState(null, "", linkFor(node.id));
  render();
  if (fromConnections) el("title").focus();
}
function makeButton(label, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => choose(id));
  return button;
}
function renderIndex() {
  const query = find.value.trim().toLowerCase();
  const matches = graph.nodes.filter((node) =>
    [node.id, node.name, node.kind, node.description].some((v) =>
      v.toLowerCase().includes(query),
    ),
  );
  const previous = document.activeElement?.dataset.record;
  const buttons = matches.map((node) => {
    const button = makeButton(node.name, node.id);
    button.dataset.record = node.id;
    button.setAttribute("aria-pressed", String(selected.id === node.id));
    return button;
  });
  el("records").replaceChildren(...buttons);
  if (previous)
    buttons.find((button) => button.dataset.record === previous)?.focus();
  el("matches").textContent =
    matches.length + " of " + graph.nodes.length + " records";
}
function render() {
  lens.value = graph.id;
  el("map-title").textContent = graph.name;
  el("count").textContent = graph.nodes.length + " records";
  el("kind").textContent = selected.kind + " / " + selected.id;
  const claim = evidence.get(selected.id);
  el("title").textContent = claim ? "Recorded claim" : selected.name;
  el("description").textContent = claim
    ? claim.statement
    : selected.description;
  el("evidence-notes").hidden = !claim;
  if (claim) {
    el("scope").textContent = claim.scope;
    el("check").textContent = claim.independentCheck;
  }
  const kinds = [...new Set(graph.nodes.map((node) => node.kind))];
  el("legend").replaceChildren(
    ...kinds.map((kind, i) => {
      const item = document.createElement("li");
      item.dataset.tone = i;
      item.textContent = kind;
      return item;
    }),
  );
  const source = el("source");
  source.hidden = !selected.url;
  if (selected.url) {
    source.href = selected.url;
    source.textContent =
      selected.kind === "Source" ? "Open original page" : "Open component file";
  } else source.removeAttribute("href");
  const neighbors = [];
  for (const edge of graph.edges) {
    if (![edge.from, edge.to].includes(selected.id)) continue;
    const from = graph.nodes.find((item) => item.id === edge.from);
    const to = graph.nodes.find((item) => item.id === edge.to);
    const other = from.id === selected.id ? to : from;
    const li = document.createElement("li");
    const button = makeButton(other.name, other.id);
    const role = document.createElement("span");
    role.textContent =
      from.id === selected.id
        ? "Outgoing · " + edge.relation
        : "Incoming · " + edge.relation;
    button.append(role);
    button.setAttribute(
      "aria-label",
      from.name + " → " + edge.relation + " → " + to.name,
    );
    li.append(button);
    neighbors.push(li);
  }
  el("connections").replaceChildren(...neighbors);
  el("permalink").href = linkFor(selected.id);
  renderIndex();
  renderCase();
  canvas.render(graph, selected.id);
}
function renderCase() {
  const panel = el("case-work"),
    compare = el("compare");
  panel.hidden = graph.id === "architecture";
  if (panel.hidden) return;
  if (panel.dataset.case !== graph.id) {
    panel.dataset.case = graph.id;
    compare.replaceChildren(
      ...[...maps.values()]
        .filter((map) => map.nextAction && map.id !== graph.id)
        .map((map) => new Option(map.name, map.id)),
    );
    el("next-action").textContent = graph.nextAction;
    for (const key of ["assumptions", "disproves"]) {
      el(key).replaceChildren(
        ...graph[key].map((text) => {
          const item = document.createElement("li");
          item.textContent = text;
          return item;
        }),
      );
    }
  }
  const other = maps.get(compare.value);
  if (!other) return;
  const rows = compareCoverage(graph, other);
  el("coverage").replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}
el("compare").addEventListener("change", renderCase);
el("brief").addEventListener("click", () =>
  download(caseBrief(graph), "text/markdown", graph.id + "-brief.md"),
);
function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  const next = maps.get(params.get("map")) || architecture;
  if (graph !== next) {
    find.value = "";
    canvas.reset();
  }
  graph = next;
  selected =
    graph.nodes.find((node) => node.id === params.get("record")) ||
    graph.nodes[0];
  render();
}
lens.addEventListener("change", () => {
  graph = maps.get(lens.value);
  find.value = "";
  canvas.reset();
  choose(graph.nodes[0].id);
});
find.addEventListener("input", renderIndex);
el("left").addEventListener("click", () => canvas.rotate(-0.22));
el("right").addEventListener("click", () => canvas.rotate(0.22));
el("up").addEventListener("click", () => canvas.rotate(0, 0.15));
el("down").addEventListener("click", () => canvas.rotate(0, -0.15));
el("reset").addEventListener("click", canvas.reset);
el("export").addEventListener("click", () => {
  const response = {
    data: { evidenceAtlas: { ...graph, selectedRecord: selected.id } },
  };
  download(
    JSON.stringify(response, null, 2) + "\n",
    "application/json",
    graph.id + ".json",
  );
});
function download(text, type, filename) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stable-desk-" + filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener("hashchange", readLocation);
el("explorer").hidden = false;
el("title").tabIndex = -1;
readLocation();
try {
  const response = await fetch("./data/baseline.json");
  if (!response.ok) throw new Error("Unavailable baseline");
  const data = await response.json();
  for (const claim of data.evidence) evidence.set(claim.id, claim);
  for (const priority of data.priorities) {
    const map = caseGraph(data, priority);
    maps.set(map.id, map);
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = priority.title;
    lens.add(option);
  }
  readLocation();
} catch {
  el("notice").textContent =
    "The public baseline could not be loaded. The architecture map and reference are available.";
}
