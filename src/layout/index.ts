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
}

export function layoutGenogram({
    graph, elements, persons, parentChildLinks, mateLinks, unions, familyRelations, sizes, linkStyle = 'fan', linkShapes,
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface FormerCoupleInfo { fromId: string; toId: string; unionId: string; }
    const formerCoupleInfos: FormerCoupleInfo[] = [];

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
        const formerMls  = hubMl.filter(ml => ml.status === 'divorced' || ml.status === 'separated');
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
    // Step 3.6: Active-side child repositioning
    //   For multi-partner hubs, children of active unions belong to the RIGHT
    //   of children of former (divorced/separated) unions. Dagre's crossing
    //   minimization often places them on the wrong side; correct it here.
    // -----------------------------------------------------------------------

    for (const { hubId, orderedIds, unionByPartner } of multiPartnerInfos) {
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
        if (activeChildIds.length === 0) continue;

        // Rightmost right-edge across all former-side children and their mates
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
        if (rightmostEdge === -Infinity) continue;

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
        const stroke = qualityStrokeColor(union.quality);

        // Spine: biological couple midpoint bottom → bar level
        const spine = makeSegment(stroke);
        spine.source({ x: midX, y: parentBottomY });
        spine.target({ x: midX, y: barY });
        graph.addCell(spine);

        // Horizontal bar spanning all children (or single-child offset)
        const minChildX = Math.min(...childCenterXs);
        const maxChildX = Math.max(...childCenterXs);
        const barLeft  = Math.min(midX, minChildX);
        const barRight = Math.max(midX, maxChildX);
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
        const dasharray = status === 'divorced' ? '10 5' : status === 'separated' ? '5 4' : '';
        const link = new MateLinkShape({
            source: { id: fromId, anchor: { name: 'center', args: { useModelGeometry: true } } },
            target: { id: toId, anchor: { name: 'center', args: { useModelGeometry: true } } },
        });
        link.attr('line/stroke', stroke);
        if (dasharray) link.attr('line/strokeDasharray', dasharray);

        const type = union?.type;
        if (type && type !== 'unknown') {
            const typeStr = type === 'married' ? 'Married' : type === 'cohabiting' ? 'Cohabiting' : 'Affair';
            const statusStr = status === 'divorced' ? ', Divorced' : status === 'separated' ? ', Separated' : '';
            link.labels([{
                position: { distance: 0.5, offset: -29 },
                attrs: {
                    text: { text: typeStr + statusStr, fontSize: 9, fill: '#64748b', fontFamily: 'system-ui, sans-serif' },
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

    // Truly-former couple mate links (non-hub divorced pairs)
    const formerMateLinks_ = formerCoupleInfos.map(({ fromId, toId, unionId }) => makeMateLink(fromId, toId, unionId));
    if (formerMateLinks_.length > 0) graph.addCells(formerMateLinks_);
}
