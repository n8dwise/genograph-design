import { shapes } from '@joint/core';
import { DirectedGraph } from '@joint/layout-directed-graph';
import { sizes as themeSizes, qualityStrokeColor } from '../theme';
import { minimizeCrossings } from './minimize-crossings';
import type { dia } from '@joint/core';
import type { LayoutPersonNode, LayoutParentChildLink, LayoutMateLink, Union, FamilyRelation } from '../data';

type LinkConstructor = new (attrs: Record<string, unknown>) => dia.Link;

interface LayoutSizes {
    symbolWidth: number;
    symbolHeight: number;
    coupleGap: number;
    symbolGap: number;
    levelGap: number;
    nameMaxLineCount: number;
}

interface LayoutInput {
    graph: dia.Graph;
    elements: dia.Element[];
    persons: LayoutPersonNode[];
    parentChildLinks: LayoutParentChildLink[];
    mateLinks: LayoutMateLink[];
    unions: Union[];
    familyRelations?: FamilyRelation[];
    sizes: LayoutSizes;
    linkStyle?: 'fan' | 'orthogonal';
    linkShapes?: {
        ParentChildLink?: LinkConstructor;
        MateLink?: LinkConstructor;
    };
    savedPositions?: Record<string, { x: number; y: number }>;
}

export function layoutGenogram({
    graph, elements, persons, parentChildLinks, mateLinks, unions, familyRelations, sizes, linkStyle = 'fan', linkShapes, savedPositions,
}: LayoutInput): void {

    const ParentChildLinkShape = linkShapes?.ParentChildLink ?? shapes.standard.Link as unknown as LinkConstructor;
    const MateLinkShape = linkShapes?.MateLink ?? shapes.standard.Link as unknown as LinkConstructor;

    const personById = new Map<number, LayoutPersonNode>();
    for (const person of persons) personById.set(person.id, person);

    const unionById = new Map<string, Union>();
    for (const u of unions) unionById.set(u.id, u);

    // -----------------------------------------------------------------------
    // Step 1: Couple containers
    // -----------------------------------------------------------------------

    const coupleContainers: dia.Element[] = [];
    const personIdToContainer = new Map<string, dia.Element>();
    const mateOf = new Map<string, string>();
    const coupledPersonIds = new Set<string>();

    interface CoupleInfo { container: dia.Element; fromId: string; toId: string; unionId: string; }
    const coupleInfos: CoupleInfo[] = [];

    // Hub persons (in 2+ unions) get a wide timeline container:
    //   [former partner(s)…] [hub] [active partner(s)…]
    // This keeps all of a person's relationships in a single dagre node so
    // mate lines never cross each other or pass through other partners.
    interface MultiPartnerInfo {
        container: dia.Element;
        hubId: string;
        orderedIds: string[];               // left→right: former(s), hub, active(s)
        unionByPartner: Map<string, Union>; // partnerId → their union with hub
    }
    const multiPartnerInfos: MultiPartnerInfo[] = [];

    // Sort active-first so the active union gets priority for container ownership.
    const sortedMateLinks = [...mateLinks].sort((a, b) => {
        const priority = (s?: string) => (!s || s === 'active') ? 0 : s === 'separated' ? 1 : 2;
        return priority(a.status) - priority(b.status);
    });

    // Index: personId → all their mate links
    const personMlMap = new Map<string, LayoutMateLink[]>();
    for (const ml of sortedMateLinks) {
        for (const pid of [String(ml.from), String(ml.to)]) {
            if (!personMlMap.has(pid)) personMlMap.set(pid, []);
            personMlMap.get(pid)!.push(ml);
        }
    }

    const handledIds = new Set<string>();

    // --- Hub persons: 2+ unions → wide timeline container ---
    for (const [hubId, hubMl] of personMlMap) {
        if (hubMl.length < 2 || handledIds.has(hubId)) continue;
        handledIds.add(hubId);

        const getPartner = (ml: LayoutMateLink) => String(ml.from) === hubId ? String(ml.to) : String(ml.from);
        const formerMls  = hubMl.filter(ml => ml.status === 'divorced' || ml.status === 'separated' || ml.status === 'widowed' || ml.status === 'deceased');
        const activeMls  = hubMl.filter(ml => !ml.status || ml.status === 'active');
        const formerPids = formerMls.map(getPartner).filter(pid => !handledIds.has(pid));
        const activePids = activeMls .map(getPartner).filter(pid => !handledIds.has(pid));

        // Container order: [former…] [hub] [active…]
        const orderedIds = [...formerPids, hubId, ...activePids];
        orderedIds.forEach(pid => { handledIds.add(pid); coupledPersonIds.add(pid); });

        const n = orderedIds.length;
        const extraWidth = linkStyle === 'orthogonal' ? sizes.symbolWidth : 0;
        const container = new shapes.standard.Rectangle({
            size: { width: sizes.symbolWidth * n + sizes.coupleGap * (n - 1) + extraWidth, height: sizes.symbolHeight },
        });
        coupleContainers.push(container);
        for (const pid of orderedIds) personIdToContainer.set(pid, container);
        // mateOf: point to hub (used for y-snapping)
        for (const pid of orderedIds) { if (pid !== hubId) mateOf.set(pid, hubId); }
        mateOf.set(hubId, activePids[0] ?? formerPids[0] ?? hubId);

        const unionByPartner = new Map<string, Union>();
        for (const ml of hubMl) {
            const u = unionById.get(ml.unionId);
            if (u) unionByPartner.set(getPartner(ml), u);
        }

        multiPartnerInfos.push({ container, hubId, orderedIds, unionByPartner });
    }

    // --- Standard 2-person containers (remaining non-hub couples) ---
    for (const ml of sortedMateLinks) {
        const fromId = String(ml.from);
        const toId   = String(ml.to);
        if (handledIds.has(fromId) || handledIds.has(toId)) continue;

        handledIds.add(fromId); handledIds.add(toId);
        coupledPersonIds.add(fromId); coupledPersonIds.add(toId);
        mateOf.set(fromId, toId); mateOf.set(toId, fromId);

        const extraWidth = linkStyle === 'orthogonal' ? sizes.symbolWidth : 0;
        const container = new shapes.standard.Rectangle({
            size: { width: sizes.symbolWidth * 2 + sizes.coupleGap + extraWidth, height: sizes.symbolHeight },
        });
        personIdToContainer.set(fromId, container);
        personIdToContainer.set(toId, container);
        coupleContainers.push(container);
        coupleInfos.push({ container, fromId, toId, unionId: ml.unionId });
    }

    function layoutId(personElId: string): string {
        return personIdToContainer.get(personElId)?.id as string ?? personElId;
    }

    const elementById = new Map<string, dia.Element>();
    for (const el of elements) elementById.set(el.id as string, el);

    const soloElements = elements.filter(el => !coupledPersonIds.has(el.id as string));
    const identicalGroupOf = new Map<number, number>();
    const nodeMultipleGroup = new Map<string, string>();

    // -----------------------------------------------------------------------
    // Step 2: Dagre layout
    // -----------------------------------------------------------------------

    // Map from container element id → the union id that created it
    const containerUnionId = new Map<string, string>();
    for (const ci of coupleInfos) containerUnionId.set(ci.container.id as string, ci.unionId);

    interface LinkInfo { link: dia.Link; realSourceId: string; realTargetId: string; fromFamilyRelation: boolean; linkUnionId?: string; }
    const linkInfos: LinkInfo[] = [];
    const layoutEdgeSet = new Set<string>();
    const duplicateLinkSet = new Set<dia.Link>();

    for (const rel of parentChildLinks) {
        const realSourceId = String(rel.parentId);
        const realTargetId = String(rel.childId);
        const srcLayout = layoutId(realSourceId);
        const tgtLayout = layoutId(realTargetId);
        const edgeKey = `${srcLayout}→${tgtLayout}`;
        const isDuplicate = layoutEdgeSet.has(edgeKey);
        layoutEdgeSet.add(edgeKey);

        const link = new ParentChildLinkShape({ source: { id: srcLayout }, target: { id: tgtLayout } });
        linkInfos.push({ link, realSourceId, realTargetId, fromFamilyRelation: !!rel.fromFamilyRelation, linkUnionId: rel.unionId });
        if (isDuplicate) duplicateLinkSet.add(link);
    }

    const links = linkInfos.map(li => li.link);
    const layoutLinks = links.filter(l => !duplicateLinkSet.has(l));

    graph.resetCells([...coupleContainers, ...soloElements, ...layoutLinks]);

    DirectedGraph.layout(graph, {
        rankDir: 'TB',
        nodeSep: sizes.symbolGap,
        rankSep: sizes.levelGap,
        customOrder: (glGraph, jointGraph, defaultOrder) => minimizeCrossings(glGraph, jointGraph, defaultOrder, {
            parentChildLinks, layoutId, personById, identicalGroupOf, nodeMultipleGroup,
        }),
    });

    const duplicateLinks = links.filter(l => duplicateLinkSet.has(l));
    if (duplicateLinks.length > 0) graph.addCells(duplicateLinks);

    // -----------------------------------------------------------------------
    // Step 3: Couple positioning
    // -----------------------------------------------------------------------

    function getParentX(personElId: string): number {
        const person = personById.get(Number(personElId));
        if (!person) return Infinity;
        const parentIds: number[] = [];
        if (typeof person.mother === 'number') parentIds.push(person.mother);
        if (typeof person.father === 'number') parentIds.push(person.father);
        if (parentIds.length === 0) return Infinity;
        let sum = 0, count = 0;
        for (const pid of parentIds) {
            const cell = graph.getCell(layoutId(String(pid))) as dia.Element;
            if (cell) { sum += cell.getCenter().x; count++; }
        }
        return count > 0 ? sum / count : Infinity;
    }

    if (sizes.nameMaxLineCount !== themeSizes.nameMaxLineCount) {
        for (const el of elements) el.attr('name/textWrap/maxLineCount', sizes.nameMaxLineCount);
    }

    for (const { container, fromId, toId } of coupleInfos) {
        const pos = container.position();
        const fromEl = elementById.get(fromId)!;
        const toEl = elementById.get(toId)!;
        const [leftEl, rightEl] = getParentX(fromId) <= getParentX(toId) ? [fromEl, toEl] : [toEl, fromEl];

        const inset = linkStyle === 'orthogonal' ? sizes.symbolWidth / 2 : 0;
        leftEl.position(pos.x + inset, pos.y);
        rightEl.position(pos.x + inset + sizes.symbolWidth + sizes.coupleGap, pos.y);
    }

    // Position persons within multi-partner (timeline) containers
    for (const { container, orderedIds } of multiPartnerInfos) {
        const pos = container.position();
        const inset = linkStyle === 'orthogonal' ? sizes.symbolWidth / 2 : 0;
        for (let i = 0; i < orderedIds.length; i++) {
            const el = elementById.get(orderedIds[i]);
            if (!el) continue;
            el.position(pos.x + inset + i * (sizes.symbolWidth + sizes.coupleGap), pos.y);
        }
    }

    graph.addCells(elements.filter(el => coupledPersonIds.has(el.id as string)));

    // -----------------------------------------------------------------------
    // Step 3.5: Generational alignment
    //   - Siblings: snap y to match their sibling's row
    //   - Aunts/Uncles: snap y to the parent generation of their reference person
    // -----------------------------------------------------------------------

    function snapToY(subjectId: string, targetY: number) {
        const subjectEl = elementById.get(subjectId);
        if (!subjectEl) return;
        subjectEl.position(subjectEl.position().x, targetY);
        const partnerId = mateOf.get(subjectId);
        if (partnerId) {
            const partnerEl = elementById.get(partnerId);
            if (partnerEl) partnerEl.position(partnerEl.position().x, targetY);
        }
    }

    function parentGenerationY(personId: number): number | null {
        // From explicit family relations
        for (const rel of (familyRelations ?? [])) {
            if (rel.type === 'parent' && rel.to === personId) {
                const y = elementById.get(String(rel.from))?.position().y;
                if (y !== undefined) return y;
            }
        }
        // From union-derived mother/father
        const node = personById.get(personId);
        if (node?.father) {
            const y = elementById.get(String(node.father))?.position().y;
            if (y !== undefined) return y;
        }
        if (node?.mother) {
            const y = elementById.get(String(node.mother))?.position().y;
            if (y !== undefined) return y;
        }
        return null;
    }

    for (const rel of (familyRelations ?? [])) {
        if (rel.type === 'sibling' || rel.type === 'half-sibling') {
            const targetEl = elementById.get(String(rel.to));
            if (targetEl) snapToY(String(rel.from), targetEl.position().y);
        } else if (rel.type === 'aunt' || rel.type === 'uncle') {
            const y = parentGenerationY(rel.to);
            if (y !== null) snapToY(String(rel.from), y);
        }
    }

    // -----------------------------------------------------------------------
    // Step 3.6: Child-side separation for multi-partner hubs
    //
    //   Part A — Active-side children pushed right of all former-side children.
    //            Dagre's crossing minimization often places them on the wrong side.
    //
    //   Part B — Former-side coupled children clamped left of the hub–active-
    //            partner midpoint. Dagre can place a coupled former child (e.g.
    //            Megan+Don) to the right of that midpoint, causing their T-bar's
    //            horizontal bar to visually bleed into the active-side T-bar at
    //            the same barY level and make the two bars look like one.
    // -----------------------------------------------------------------------

    for (const { hubId, orderedIds } of multiPartnerInfos) {
        const hubIndex = orderedIds.indexOf(hubId);
        const formerPartnerIds = new Set(orderedIds.slice(0, hubIndex));
        const activePartnerIds = new Set(orderedIds.slice(hubIndex + 1));
        if (activePartnerIds.size === 0) continue;

        const formerChildIds: number[] = [];
        const activeChildIds: number[] = [];
        for (const union of unions) {
            const [p0, p1] = union.partners;
            const isHubUnion = String(p0) === hubId || String(p1) === hubId;
            if (!isHubUnion) continue;
            const partnerStr = String(p0) === hubId ? String(p1) : String(p0);
            for (const cid of (union.children ?? [])) {
                if (formerPartnerIds.has(partnerStr)) formerChildIds.push(cid);
                else if (activePartnerIds.has(partnerStr)) activeChildIds.push(cid);
            }
        }

        // Part A: push active-side children to the right of all former-side children
        if (activeChildIds.length > 0) {
            let rightmostEdge = -Infinity;
            for (const cid of formerChildIds) {
                const el = elementById.get(String(cid));
                if (el) rightmostEdge = Math.max(rightmostEdge, el.position().x + el.size().width);
                const mateId = mateOf.get(String(cid));
                if (mateId) {
                    const mateEl = elementById.get(mateId);
                    if (mateEl) rightmostEdge = Math.max(rightmostEdge, mateEl.position().x + mateEl.size().width);
                }
            }
            if (rightmostEdge > -Infinity) {
                let nextX = rightmostEdge + sizes.symbolGap;
                for (const cid of activeChildIds) {
                    const childEl = elementById.get(String(cid));
                    if (!childEl) continue;
                    const childY = childEl.position().y;
                    const mateId = mateOf.get(String(cid));
                    if (mateId) {
                        const mateEl = elementById.get(mateId);
                        if (mateEl) {
                            const [leftEl, rightEl] = childEl.position().x <= mateEl.position().x
                                ? [childEl, mateEl] : [mateEl, childEl];
                            leftEl.position(nextX, childY);
                            rightEl.position(nextX + sizes.symbolWidth + sizes.coupleGap, childY);
                            nextX += sizes.symbolWidth * 2 + sizes.coupleGap + sizes.symbolGap;
                        }
                    } else {
                        childEl.position(nextX, childY);
                        nextX += sizes.symbolWidth + sizes.symbolGap;
                    }
                }
            }
        }

        // Part B: clamp former-side coupled children left of the hub–active-partner midpoint.
        // Process couples right-to-left so each couple stacks to the left of the previous one
        // rather than all landing at the same boundary (which caused overlaps).
        if (formerChildIds.length > 0) {
            const hubEl = elementById.get(hubId);
            if (hubEl) {
                const hubCenterX = hubEl.getCenter().x;
                const activeMidXs: number[] = [];
                for (const pid of activePartnerIds) {
                    const pEl = elementById.get(pid);
                    if (pEl) activeMidXs.push((hubCenterX + pEl.getCenter().x) / 2);
                }
                if (activeMidXs.length > 0) {
                    // Collect each unique couple among former children
                    const seen = new Set<string>();
                    const formerCouples: Array<{ childEl: dia.Element; mateEl: dia.Element }> = [];
                    for (const cid of formerChildIds) {
                        const cidStr = String(cid);
                        if (seen.has(cidStr)) continue;
                        const childEl = elementById.get(cidStr);
                        if (!childEl) continue;
                        const mateId = mateOf.get(cidStr);
                        if (!mateId) continue;
                        const mateEl = elementById.get(mateId);
                        if (!mateEl) continue;
                        seen.add(cidStr);
                        seen.add(mateId);
                        formerCouples.push({ childEl, mateEl });
                    }

                    // Sort rightmost couple first so we can stack left-ward
                    formerCouples.sort((a, b) => {
                        const aRight = Math.max(
                            a.childEl.position().x + a.childEl.size().width,
                            a.mateEl.position().x + a.mateEl.size().width,
                        );
                        const bRight = Math.max(
                            b.childEl.position().x + b.childEl.size().width,
                            b.mateEl.position().x + b.mateEl.size().width,
                        );
                        return bRight - aRight; // descending
                    });

                    // Walk right-to-left: each couple's right edge must stay left of currentBoundary
                    let currentBoundary = Math.min(...activeMidXs) - sizes.symbolGap;
                    for (const { childEl, mateEl } of formerCouples) {
                        const coupleRight = Math.max(
                            childEl.position().x + childEl.size().width,
                            mateEl.position().x + mateEl.size().width,
                        );
                        if (coupleRight > currentBoundary) {
                            const shift = coupleRight - currentBoundary;
                            const cp = childEl.position();
                            const mp = mateEl.position();
                            childEl.position(cp.x - shift, cp.y);
                            mateEl.position(mp.x - shift, mp.y);
                        }
                        // Next couple must sit to the left of this couple's left edge
                        const coupleLeft = Math.min(
                            childEl.position().x,
                            mateEl.position().x,
                        );
                        currentBoundary = coupleLeft - sizes.symbolGap;
                    }
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Step 3.7: Sort children within each union by age descending (oldest = leftmost)
    // Only activates when every child in the union has a known age AND all
    // children are solo (no mate, no multi-partner container).
    //
    // Restricting to solo children avoids width-mismatch problems: swapping
    // x-slots only works cleanly when all units are the same width. Coupled
    // children (Alex+Jordan, Megan+Don) and hub containers are skipped so that
    // the sort is reliable without disturbing surrounding relationships.
    // -----------------------------------------------------------------------

    // Build a lookup: personId → all orderedIds of their multi-partner container
    const personMultiContainerIds = new Map<string, string[]>();
    for (const { orderedIds } of multiPartnerInfos) {
        for (const pid of orderedIds) personMultiContainerIds.set(pid, orderedIds);
    }

    for (const union of unions) {
        if (!union.children || union.children.length < 2) continue;

        // Only sort when every child is solo — not part of any couple or hub container
        const allSolo = union.children.every(cid => {
            const cidStr = String(cid);
            return !mateOf.has(cidStr) && !personMultiContainerIds.has(cidStr);
        });
        if (!allSolo) continue;

        interface ChildUnit { childId: string; age: number; leftX: number; }
        const units: ChildUnit[] = [];
        let hasAllAges = true;

        for (const cid of union.children) {
            const cidStr = String(cid);
            const childEl = elementById.get(cidStr);
            if (!childEl) continue;
            const person = personById.get(cid);
            if (person?.age === undefined) { hasAllAges = false; break; }
            units.push({ childId: cidStr, age: person.age, leftX: childEl.position().x });
        }

        if (!hasAllAges || units.length < 2) continue;

        const slots = [...units].map(u => u.leftX).sort((a, b) => a - b);
        const ageOrdered = [...units].sort((a, b) => b.age - a.age);

        for (let i = 0; i < ageOrdered.length; i++) {
            const unit = ageOrdered[i];
            const delta = slots[i] - unit.leftX;
            if (Math.abs(delta) < 1) continue;
            elementById.get(unit.childId)!.position(
                elementById.get(unit.childId)!.position().x + delta,
                elementById.get(unit.childId)!.position().y,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Step 3.7b: Solo-vs-container age ordering
    // When a union has both a multi-partner-container child and a solo child
    // with known ages, ensure younger solo siblings are placed to the RIGHT of
    // the container. (Step 3.7's slot-swap can't handle mixed-width units, so
    // this targeted step fills the gap.)
    // -----------------------------------------------------------------------

    for (const union of unions) {
        if (!union.children || union.children.length < 2) continue;

        for (const soloCid of union.children) {
            const soloCidStr = String(soloCid);
            if (mateOf.has(soloCidStr) || personMultiContainerIds.has(soloCidStr)) continue;
            const soloEl = elementById.get(soloCidStr);
            const soloAge = personById.get(soloCid)?.age;
            if (!soloEl || soloAge === undefined) continue;

            for (const contCid of union.children) {
                if (contCid === soloCid) continue;
                const contCidStr = String(contCid);
                const containerIds = personMultiContainerIds.get(contCidStr);
                if (!containerIds) continue;
                const contAge = personById.get(contCid)?.age;
                if (contAge === undefined) continue;

                if (soloAge < contAge) {
                    // Solo child is younger → must sit to the RIGHT of the container
                    const contRight = Math.max(
                        ...containerIds.map(pid => (elementById.get(pid)?.position().x ?? 0) + sizes.symbolWidth)
                    );
                    if (soloEl.position().x < contRight + sizes.symbolGap) {
                        soloEl.position(contRight + sizes.symbolGap, soloEl.position().y);
                    }
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Step 3.8: Overlap prevention — sweep each Y-row left→right and push
    // apart any person boxes that are closer than symbolGap.
    // Moves the element plus its direct mate to preserve couple spacing.
    // Three passes handle most cascading overlaps without infinite loops.
    // -----------------------------------------------------------------------
    {
        const rowTolerance = sizes.symbolHeight * 0.75;
        // Group elements by approximate Y row
        const rows = new Map<number, dia.Element[]>();
        for (const el of elements) {
            const y = el.position().y;
            let matched: number | undefined;
            for (const k of rows.keys()) {
                if (Math.abs(k - y) <= rowTolerance) { matched = k; break; }
            }
            if (matched === undefined) { matched = y; rows.set(matched, []); }
            rows.get(matched)!.push(el);
        }

        // Move element + direct mate only. Do NOT cascade to multi-partner container
        // siblings: that would drag Carol when Susan is pushed right (or vice versa),
        // causing new overlaps on the left side of the container.
        const pushRight = (el: dia.Element, delta: number) => {
            el.position(el.position().x + delta, el.position().y);
            const mateId = mateOf.get(el.id as string);
            if (mateId) {
                const mateEl = elementById.get(mateId);
                if (mateEl) mateEl.position(mateEl.position().x + delta, mateEl.position().y);
            }
        };

        for (let pass = 0; pass < 3; pass++) {
            for (const rowEls of rows.values()) {
                rowEls.sort((a, b) => a.position().x - b.position().x);
                for (let i = 1; i < rowEls.length; i++) {
                    const prev = rowEls[i - 1];
                    const curr = rowEls[i];
                    const gap = curr.position().x - (prev.position().x + prev.size().width);
                    if (gap < sizes.symbolGap) pushRight(curr, sizes.symbolGap - gap);
                }
            }
        }
    }

    // Apply user-dragged position overrides — must happen after all auto-layout
    // steps so T-bars in Step 4 are computed from the saved positions.
    if (savedPositions) {
        for (const el of elements) {
            const saved = savedPositions[el.id as string];
            if (saved) el.position(saved.x, saved.y);
        }
    }

    // -----------------------------------------------------------------------
    // Step 4: Remove dagre placeholder links; draw T-bar routing
    //   Each union with children gets: spine from biological couple midpoint
    //   → horizontal bar → individual drops to each child. This produces
    //   clean right-angle lines with no crossing diagonals.
    // -----------------------------------------------------------------------

    graph.removeCells(links);

    const barDrop = Math.round(sizes.levelGap * 0.35);

    function makeSegment(stroke: string): dia.Link {
        const l = new ParentChildLinkShape({});
        l.attr('line/stroke', stroke);
        return l;
    }

    // Union-based T-bars (drawn for ALL unions, including divorced ones)
    for (const union of unions) {
        if (!union.children || union.children.length === 0) continue;

        const [p0Id, p1Id] = union.partners;
        const el0 = elementById.get(String(p0Id));
        const el1 = elementById.get(String(p1Id));

        let midX: number;
        let parentBottomY: number;

        if (el0 && el1) {
            const c0 = el0.getCenter();
            const c1 = el1.getCenter();
            midX = (c0.x + c1.x) / 2;
            parentBottomY = Math.max(
                el0.position().y + el0.size().height,
                el1.position().y + el1.size().height,
            );
        } else if (el0) {
            midX = el0.getCenter().x;
            parentBottomY = el0.position().y + el0.size().height;
        } else if (el1) {
            midX = el1.getCenter().x;
            parentBottomY = el1.position().y + el1.size().height;
        } else continue;

        const childEls = (union.children ?? [])
            .map(cId => elementById.get(String(cId)))
            .filter((el): el is dia.Element => !!el);
        if (childEls.length === 0) continue;

        const barY = parentBottomY + barDrop;
        const childCenterXs = childEls.map(el => el.getCenter().x);
        const minChildX = Math.min(...childCenterXs);
        const maxChildX = Math.max(...childCenterXs);
        const childrenMidX = (minChildX + maxChildX) / 2;
        const stroke = qualityStrokeColor(undefined); // T-bars are always neutral — quality only colors mate lines

        // Spine: straight drop for a single child; Z-step to centre over multiple children
        // when the couple midpoint doesn't already land between them.
        // Z-step draws: down → across to childrenMidX → down to barY.
        // Single-child unions skip the Z-step to avoid a U-shape that visually bleeds
        // into adjacent T-bars; instead the bar at barY connects the spine to the child.
        const useZStep = childEls.length > 1 && Math.abs(midX - childrenMidX) > 1;
        let spineEndX: number;

        if (useZStep) {
            const stepY = parentBottomY + Math.round(barDrop / 2);
            const down1 = makeSegment(stroke);
            down1.source({ x: midX, y: parentBottomY });
            down1.target({ x: midX, y: stepY });
            graph.addCell(down1);
            const across = makeSegment(stroke);
            across.source({ x: Math.min(midX, childrenMidX), y: stepY });
            across.target({ x: Math.max(midX, childrenMidX), y: stepY });
            graph.addCell(across);
            const down2 = makeSegment(stroke);
            down2.source({ x: childrenMidX, y: stepY });
            down2.target({ x: childrenMidX, y: barY });
            graph.addCell(down2);
            spineEndX = childrenMidX;
        } else {
            const spine = makeSegment(stroke);
            spine.source({ x: midX, y: parentBottomY });
            spine.target({ x: midX, y: barY });
            graph.addCell(spine);
            spineEndX = midX;
        }

        // Horizontal bar: spans from spine end through all children, ensuring the
        // spine is always visually connected to every child's drop point.
        const barLeft = Math.min(spineEndX, minChildX);
        const barRight = Math.max(spineEndX, maxChildX);
        if (Math.abs(barRight - barLeft) > 1) {
            const bar = makeSegment(stroke);
            bar.source({ x: barLeft, y: barY });
            bar.target({ x: barRight, y: barY });
            graph.addCell(bar);
        }

        // Drops: bar level → each child's top
        for (let i = 0; i < childEls.length; i++) {
            const drop = makeSegment(stroke);
            drop.source({ x: childCenterXs[i], y: barY });
            drop.target({ id: String(childEls[i].id), anchor: { name: 'top', args: { useModelGeometry: true } } });
            graph.addCell(drop);
        }
    }

    // Family-relation parent/child: right-angle elbow (single parent, no T-bar)
    for (const rel of (familyRelations ?? [])) {
        if (rel.type !== 'parent' && rel.type !== 'child') continue;
        const parentId = rel.type === 'parent' ? rel.from : rel.to;
        const childId  = rel.type === 'parent' ? rel.to   : rel.from;
        const parentEl = elementById.get(String(parentId));
        const childEl  = elementById.get(String(childId));
        if (!parentEl || !childEl) continue;

        const px = parentEl.getCenter().x;
        const py = parentEl.position().y + parentEl.size().height;
        const cx = childEl.getCenter().x;
        const midY = py + barDrop;
        const stroke = qualityStrokeColor(rel.quality);

        const elbow = makeSegment(stroke);
        elbow.source({ x: px, y: py });
        elbow.target({ id: String(childId), anchor: { name: 'top', args: { useModelGeometry: true } } });
        elbow.vertices([{ x: px, y: midY }, { x: cx, y: midY }]);
        graph.addCell(elbow);
    }

    for (const container of coupleContainers) container.remove();

    // -----------------------------------------------------------------------
    // Step 5: Mate links — colored by quality, dashed if ended
    // -----------------------------------------------------------------------

    function makeMateLink(fromId: string, toId: string, unionId: string): dia.Link {
        const union = unionById.get(unionId);
        const stroke = qualityStrokeColor(union?.quality);
        const status = union?.status ?? 'active';
        const dasharray =
            status === 'divorced'  ? '10 5' :
            status === 'separated' ? '5 4' :
            status === 'widowed'   ? '3 4' :
            status === 'deceased'  ? '8 4 2 4' :
            '';
        const link = new MateLinkShape({
            source: { id: fromId, anchor: { name: 'center', args: { useModelGeometry: true } } },
            target: { id: toId, anchor: { name: 'center', args: { useModelGeometry: true } } },
            unionId,
        });
        link.attr('line/stroke', stroke);
        if (dasharray) link.attr('line/strokeDasharray', dasharray);

        const type = union?.type;
        if (type && type !== 'unknown') {
            const typeStr = type === 'married' ? 'Married' : type === 'cohabiting' ? 'Cohabiting' : type === 'affair' ? 'Affair' : (union?.label || 'Other');
            const isEnded = status === 'divorced' || status === 'separated' || status === 'widowed' || status === 'deceased';
            let labelText: string;
            if (!isEnded) {
                const bothDeceased = personById.get(Number(fromId))?.deceased && personById.get(Number(toId))?.deceased;
                labelText = bothDeceased ? `${typeStr}, Deceased` : typeStr;
            } else if (status === 'separated' && (type === 'cohabiting' || type === 'affair')) {
                // Non-marriage separation needs context ("Cohabiting, Separated")
                labelText = `${typeStr}, Separated`;
            } else {
                // Ended state is self-explanatory: show status only
                labelText =
                    status === 'divorced'  ? 'Divorced'  :
                    status === 'separated' ? 'Separated' :
                    status === 'widowed'   ? 'Widowed'   :
                    'Both Deceased';
            }
            link.labels([{
                position: { distance: 0.5, offset: -29 },
                attrs: {
                    text: { text: labelText, fontSize: 9, fill: '#64748b', fontFamily: 'system-ui, sans-serif' },
                    rect: { fill: 'white', stroke: '#e2e8f0', strokeWidth: 1, rx: 2, ry: 2 },
                },
            }]);
        }

        return link;
    }

    // Standard 2-person couple mate links
    const mateLinks_ = coupleInfos.map(({ fromId, toId, unionId }) => makeMateLink(fromId, toId, unionId));
    if (mateLinks_.length > 0) graph.addCells(mateLinks_);

    // Multi-partner hub: one mate link per partner (draws all unions: active + former)
    const multiMateLinks_: dia.Link[] = [];
    for (const { hubId, orderedIds, unionByPartner } of multiPartnerInfos) {
        for (const partnerId of orderedIds) {
            if (partnerId === hubId) continue;
            const union = unionByPartner.get(partnerId);
            if (!union) continue;
            multiMateLinks_.push(makeMateLink(hubId, partnerId, union.id));
        }
    }
    if (multiMateLinks_.length > 0) graph.addCells(multiMateLinks_);

}
