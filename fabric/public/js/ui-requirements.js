/* ScreenSpec davranis gereksinimleri: saf ve deterministic.
   Dogal dili yorumlamaz; cagirici gereksinim kumesini acik vermelidir. */

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.sections || node.children || []) walk(child, visit);
}

function actionsOf(node) {
  const out = [];
  if (node?.action) out.push(node.action);
  for (const item of node?.actions || []) if (item?.action) out.push(item.action);
  return out;
}

/** requirements: scroll-region | range | range-change-action | capability:<name> */
export function meetsUiRequirements(spec, requirements = []) {
  const seen = { scrollRegion: false, range: false, rangeChangeAction: false, capabilities: new Set() };
  walk(spec, (node) => {
    if (node.type === "scroll-region") seen.scrollRegion = true;
    if (node.type === "range") {
      seen.range = true;
      if (node.action?.type && typeof node.valueKey === "string") seen.rangeChangeAction = true;
    }
    for (const action of actionsOf(node)) if (typeof action?.type === "string") seen.capabilities.add(action.type);
  });
  return requirements.every((requirement) => {
    if (requirement === "scroll-region") return seen.scrollRegion;
    if (requirement === "range") return seen.range;
    if (requirement === "range-change-action") return seen.rangeChangeAction;
    if (typeof requirement === "string" && requirement.startsWith("capability:")) {
      return seen.capabilities.has(requirement.slice("capability:".length));
    }
    return false;
  });
}
