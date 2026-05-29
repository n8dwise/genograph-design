import { shapes } from '@joint/core';
import { DirectedGraph } from '@joint/layout-directed-graph';
import { sizes as themeSizes } from '../theme';
import { minimizeCrossings } from './minimize-crossings';
import { styleUnionBox } from '../shapes';
import type { dia } from '@joint/core';
import type { LayoutPersonNode, LayoutParentChildLink, LayoutMateLink, Union } from '../data';
import type { UnionBox } from '../shapes';

type LinkConstructor = new (attrs: Record<string, unknown>) => dia.Link;
type UnionBoxConstructor = new (attrs: Record<string, unknown>) => dia.Element;

interface LayoutSizes {
    symbolWidth: number;
    symbolHeight: number;
    coupleGap: number;
    unionBoxWidth: number;
    unionBoxHeight: number;
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
    sizes: LayoutSizes;
    linkStyle?: 'fan' | 'orthogonal';
    linkShapes?: {
        ParentChildLink?: LinkConstructor;
        MateLink?: LinkConstructor;
        UnionBox?: UnionBoxConstructor;
    };
}

// Layout a genogram as a directed graph (top-to-bottom family tree).
//
// Steps:
// 1. COUPLE CONTAINERS — invisible wide rectangles so dagre treats each couple
//    as one node and keeps partners side-by-side.
// 2. DAGRE LAYOUT — run DirectedGraph.layout with custom crossing minimization.
// 3. COUPLE POSITIONING — place each partner inside their container.
// 4. LINK RECONNECTION & ROUTING — reconnect links to real elements and add
//    vertices routing through the union midpoint.
// 5. UNION BOXES & MATE LINKS — add a visible UnionBox at each couple midpoint
//    and short mate links on each side of it.
//
export function layoutGenogram({
    graph, elements, persons, parentChildLinks, mateLinks, unions, sizes, linkStyle = 'fan', linkShapes,
}: LayoutInput): void {

    const ParentChildLinkShape = linkShapes?.ParentChildLink ?? shapes.standard.Link as unknown as LinkConstructor;
    const MateLinkShape = linkShapes?.MateLink ?? shapes.standard.Link as unknown as LinkConstructor;
    const UnionBoxShape = linkShapes?.UnionBox;

    const personById = new Map<number, LayoutPersonNode>();
    for (const person of persons) {
        personById.set(person.id, person);
    }

    // -----------------------------------------------------------------------
    // Step 1: Couple containers
    // -----------------------------------------------------------------------

    const coupleContainers: dia.Element[] = [];
    const personIdToContainer = new Map<string, dia.Element>();
    const mateOf = new Map<string, string>();
    const coupledPersonIds = new Set<string>();

    interface CoupleInfo {
        container: dia.Element;
        fromId: string;
        toId: string;
        unionId: string;
    }
    const coupleInfos: CoupleInfo[] = [];

    for (const ml of mateLinks) {
        const fromId = String(ml.from);
        const toId = String(ml.to);

        if (coupledPersonIds.has(fromId) || coupledPersonIds.has(toId)) continue;

        const extraWidth = linkStyle === 'orthogonal' ? sizes.symbolWidth : 0;
        const container = new shapes.standard.Rectangle({
            size: {
                width: sizes.symbolWidth * 2 + sizes.coupleGap + extraWidth,
                height: sizes.symbolHeight,
            },
        });

        coupledPersonIds.add(fromId);
        coupledPersonIds.add(toId);
        mateOf.set(fromId, toId);
        mateOf.set(toId, fromId);
        personIdToContainer.set(fromId, container);
        personIdToContainer.set(toId, container);
        coupleContainers.push(container);
        coupleInfos.push({ container, fromId, toId, unionId: ml.unionId });
    }

    function layoutId(personElId: string): string {
        const container = personIdToContainer.get(personElId);
        return container ? container.id as string : personElId;
    }

    const elementById = new Map<string, dia.Element>();
    for (const el of elements) {
        elementById.set(el.id as string, el);
    }

    const soloElements = elements.filter((el) => !coupledPersonIds.has(el.id as string));

    const identicalGroupOf = new Map<number, number>();
    const nodeMultipleGroup = new Map<string, string>();

    // -----------------------------------------------------------------------
    // Step 2: Dagre layout
    // -----------------------------------------------------------------------

    interface LinkInfo {
        link: dia.Link;
        realSourceId: string;
        realTargetId: string;
    }
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

        const link = new ParentChildLinkShape({
            source: { id: srcLayout },
            target: { id: tgtLayout },
        });
        linkInfos.push({ link, realSourceId, realTargetId });
        if (isDuplicate) duplicateLinkSet.add(link);
    }

    const links = linkInfos.map((li) => li.link);
    const layoutLinks = links.filter((l) => !duplicateLinkSet.has(l));

    graph.resetCells([...coupleContainers, ...soloElements, ...layoutLinks]);

    DirectedGraph.layout(graph, {
        rankDir: 'TB',
        nodeSep: sizes.symbolGap,
        rankSep: sizes.levelGap,
        customOrder: (glGraph, jointGraph, defaultOrder) => minimizeCrossings(glGraph, jointGraph, defaultOrder, {
            parentChildLinks, layoutId, personById, identicalGroupOf, nodeMultipleGroup,
        }),
    });

    const duplicateLinks = links.filter((l) => duplicateLinkSet.has(l));
    if (duplicateLinks.length > 0) graph.addCells(duplicateLinks);

    // -----------------------------------------------------------------------
    // Step 3: Couple positioning
    // -----------------------------------------------------------------------

    const gap = sizes.coupleGap;

    function getParentX(personElId: string): number {
        const person = personById.get(Number(personElId));
        if (!person) return Infinity;
        const parentIds: number[] = [];
        if (typeof person.mother === 'number') parentIds.push(person.mother);
        if (typeof person.father === 'number') parentIds.push(person.father);
        if (parentIds.length === 0) return Infinity;

        let sum = 0, count = 0;
        for (const pid of parentIds) {
            const parentCell = graph.getCell(layoutId(String(pid))) as dia.Element;
            if (parentCell) { sum += parentCell.getCenter().x; count++; }
        }
        return count > 0 ? sum / count : Infinity;
    }

    if (sizes.nameMaxLineCount !== themeSizes.nameMaxLineCount) {
        for (const el of elements) {
            el.attr('name/textWrap/maxLineCount', sizes.nameMaxLineCount);
        }
    }

    for (const { container, fromId, toId } of coupleInfos) {
        const pos = container.position();
        const fromEl = elementById.get(fromId)!;
        const toEl = elementById.get(toId)!;

        const fromParentX = getParentX(fromId);
        const toParentX = getParentX(toId);

        const [leftEl, rightEl] = fromParentX <= toParentX
            ? [fromEl, toEl]
            : [toEl, fromEl];

        const inset = linkStyle === 'orthogonal' ? sizes.symbolWidth / 2 : 0;
        leftEl.position(pos.x + inset, pos.y);
        rightEl.position(pos.x + inset + sizes.symbolWidth + gap, pos.y);

        if (linkStyle === 'orthogonal') {
            leftEl.attr('name', { textAnchor: 'end', x: `calc(w / 2 - ${themeSizes.nameMargin})` });
            rightEl.attr('name', { textAnchor: 'start', x: `calc(w / 2 + ${themeSizes.nameMargin})` });
        }
    }

    const coupledElements = elements.filter((el) => coupledPersonIds.has(el.id as string));
    graph.addCells(coupledElements);

    // -----------------------------------------------------------------------
    // Step 4: Link reconnection & routing
    // -----------------------------------------------------------------------

    const containerIdSet = new Set(coupleContainers.map((c) => c.id as string));
    const halfBox = sizes.unionBoxHeight / 2;

    for (const { link, realSourceId, realTargetId } of linkInfos) {
        const sourceLayoutId = (link.source() as { id: string }).id;
        const targetLayoutId = (link.target() as { id: string }).id;
        const sourceWasContainer = containerIdSet.has(sourceLayoutId);
        const targetWasContainer = containerIdSet.has(targetLayoutId);

        link.source({ id: realSourceId });
        link.target({
            id: realTargetId,
            anchor: { name: 'top', args: { useModelGeometry: true } },
        });

        if (sourceWasContainer) {
            const partnerId = mateOf.get(realSourceId)!;
            const sourceEl = graph.getCell(realSourceId) as dia.Element;
            const partnerEl = graph.getCell(partnerId) as dia.Element;
            const targetEl = graph.getCell(realTargetId) as dia.Element;

            const sourceCenter = sourceEl.getCenter();
            const partnerCenter = partnerEl.getCenter();
            const targetCenter = targetEl.getCenter();

            const midX = (sourceCenter.x + partnerCenter.x) / 2;
            const midY = (sourceCenter.y + partnerCenter.y) / 2;
            // Route from union box bottom (midY + halfBox) down to child
            const boxBottomY = midY + halfBox;

            if (linkStyle === 'orthogonal') {
                const thirdY = boxBottomY + (targetCenter.y - boxBottomY) / 3;
                const twoThirdsY = boxBottomY + 2 * (targetCenter.y - boxBottomY) / 3;
                link.vertices([
                    { x: sourceCenter.x, y: thirdY },
                    { x: midX, y: thirdY },
                    { x: midX, y: twoThirdsY },
                    { x: targetCenter.x, y: twoThirdsY },
                ]);
            } else {
                const halfwayY = (boxBottomY + targetCenter.y) / 2;
                link.vertices([
                    { x: midX, y: boxBottomY },
                    { x: midX, y: halfwayY },
                    { x: targetCenter.x, y: halfwayY },
                ]);
            }
        }

        if (targetWasContainer && !sourceWasContainer) {
            const targetEl = graph.getCell(realTargetId) as dia.Element;
            const targetCenter = targetEl.getCenter();
            const sourceEl = graph.getCell(realSourceId) as dia.Element;
            const sourceCenter = sourceEl.getCenter();

            if (linkStyle === 'orthogonal') {
                const midY = sourceCenter.y + sourceEl.size().height / 2;
                const thirdY = midY + (targetCenter.y - midY) / 3;
                link.vertices([
                    { x: sourceCenter.x, y: thirdY },
                    { x: targetCenter.x, y: thirdY },
                ]);
            } else {
                const halfwayY = (sourceCenter.y + targetCenter.y) / 2;
                link.vertices([
                    { x: sourceCenter.x, y: halfwayY },
                    { x: targetCenter.x, y: halfwayY },
                ]);
            }
        }
    }

    for (const container of coupleContainers) container.remove();

    // -----------------------------------------------------------------------
    // Step 5: Union boxes & mate links
    // -----------------------------------------------------------------------

    const unionById = new Map<string, Union>();
    for (const u of unions) unionById.set(u.id, u);

    const newCells: dia.Cell[] = [];

    for (const { fromId, toId, unionId } of coupleInfos) {
        const fromEl = graph.getCell(fromId) as dia.Element;
        const toEl = graph.getCell(toId) as dia.Element;
        if (!fromEl || !toEl) continue;

        const fromCenter = fromEl.getCenter();
        const toCenter = toEl.getCenter();
        const midX = (fromCenter.x + toCenter.x) / 2;
        const midY = (fromCenter.y + toCenter.y) / 2;

        const union = unionById.get(unionId);

        // Union box centered at midpoint between partners
        if (UnionBoxShape) {
            const box = new UnionBoxShape({}) as unknown as UnionBox;
            box.position(
                midX - sizes.unionBoxWidth / 2,
                midY - sizes.unionBoxHeight / 2,
            );
            styleUnionBox(box, union?.quality, union?.status);
            newCells.push(box);

            // Short mate links: left partner → box, box → right partner
            const [leftId, rightId] = fromCenter.x <= toCenter.x
                ? [fromId, toId]
                : [toId, fromId];

            newCells.push(
                new MateLinkShape({
                    source: { id: leftId, anchor: { name: 'right', args: { useModelGeometry: true } } },
                    target: { id: box.id, anchor: { name: 'left', args: { useModelGeometry: true } } },
                }),
                new MateLinkShape({
                    source: { id: box.id, anchor: { name: 'right', args: { useModelGeometry: true } } },
                    target: { id: rightId, anchor: { name: 'left', args: { useModelGeometry: true } } },
                }),
            );
        } else {
            // Fallback: single mate link when no UnionBox shape provided
            newCells.push(new MateLinkShape({
                source: { id: fromId, anchor: { name: 'center', args: { useModelGeometry: true } } },
                target: { id: toId, anchor: { name: 'center', args: { useModelGeometry: true } } },
            }));
        }
    }

    if (newCells.length > 0) graph.addCells(newCells);
}
