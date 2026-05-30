import { shapes } from '@joint/core';
import { DirectedGraph } from '@joint/layout-directed-graph';
import { sizes as themeSizes, qualityStrokeColor } from '../theme';
import { minimizeCrossings } from './minimize-crossings';
import type { dia } from '@joint/core';
import type { LayoutPersonNode, LayoutParentChildLink, LayoutMateLink, Union } from '../data';

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
    sizes: LayoutSizes;
    linkStyle?: 'fan' | 'orthogonal';
    linkShapes?: {
        ParentChildLink?: LinkConstructor;
        MateLink?: LinkConstructor;
    };
}

export function layoutGenogram({
    graph, elements, persons, parentChildLinks, mateLinks, unions, sizes, linkStyle = 'fan', linkShapes,
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

    for (const ml of mateLinks) {
        const fromId = String(ml.from);
        const toId = String(ml.to);
        if (coupledPersonIds.has(fromId) || coupledPersonIds.has(toId)) continue;

        const extraWidth = linkStyle === 'orthogonal' ? sizes.symbolWidth : 0;
        const container = new shapes.standard.Rectangle({
            size: { width: sizes.symbolWidth * 2 + sizes.coupleGap + extraWidth, height: sizes.symbolHeight },
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

    interface LinkInfo { link: dia.Link; realSourceId: string; realTargetId: string; }
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
        linkInfos.push({ link, realSourceId, realTargetId });
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

        if (linkStyle === 'orthogonal') {
            leftEl.attr('name', { textAnchor: 'end', x: `calc(w / 2 - ${themeSizes.nameMargin})` });
            rightEl.attr('name', { textAnchor: 'start', x: `calc(w / 2 + ${themeSizes.nameMargin})` });
        }
    }

    graph.addCells(elements.filter(el => coupledPersonIds.has(el.id as string)));

    // -----------------------------------------------------------------------
    // Step 4: Link reconnection & routing
    // -----------------------------------------------------------------------

    const containerIdSet = new Set(coupleContainers.map(c => c.id as string));

    for (const { link, realSourceId, realTargetId } of linkInfos) {
        const sourceLayoutId = (link.source() as { id: string }).id;
        const targetLayoutId = (link.target() as { id: string }).id;
        const sourceWasContainer = containerIdSet.has(sourceLayoutId);
        const targetWasContainer = containerIdSet.has(targetLayoutId);

        link.source({ id: realSourceId });
        link.target({ id: realTargetId, anchor: { name: 'top', args: { useModelGeometry: true } } });

        if (sourceWasContainer) {
            const partnerId = mateOf.get(realSourceId)!;
            const sourceEl = graph.getCell(realSourceId) as dia.Element;
            const partnerEl = graph.getCell(partnerId) as dia.Element;
            const targetEl = graph.getCell(realTargetId) as dia.Element;

            const sc = sourceEl.getCenter();
            const pc = partnerEl.getCenter();
            const tc = targetEl.getCenter();
            const midX = (sc.x + pc.x) / 2;
            const midY = (sc.y + pc.y) / 2;

            if (linkStyle === 'orthogonal') {
                const thirdY = midY + (tc.y - midY) / 3;
                const twoThirdsY = midY + 2 * (tc.y - midY) / 3;
                link.vertices([
                    { x: sc.x, y: thirdY }, { x: midX, y: thirdY },
                    { x: midX, y: twoThirdsY }, { x: tc.x, y: twoThirdsY },
                ]);
            } else {
                const halfwayY = (midY + tc.y) / 2;
                link.vertices([
                    { x: midX, y: midY },
                    { x: midX, y: halfwayY },
                    { x: tc.x, y: halfwayY },
                ]);
            }
        }

        if (targetWasContainer && !sourceWasContainer) {
            const targetEl = graph.getCell(realTargetId) as dia.Element;
            const tc = targetEl.getCenter();
            const sourceEl = graph.getCell(realSourceId) as dia.Element;
            const sc = sourceEl.getCenter();
            if (linkStyle === 'orthogonal') {
                const midY = sc.y + sourceEl.size().height / 2;
                const thirdY = midY + (tc.y - midY) / 3;
                link.vertices([{ x: sc.x, y: thirdY }, { x: tc.x, y: thirdY }]);
            } else {
                const halfwayY = (sc.y + tc.y) / 2;
                link.vertices([{ x: sc.x, y: halfwayY }, { x: tc.x, y: halfwayY }]);
            }
        }
    }

    for (const container of coupleContainers) container.remove();

    // -----------------------------------------------------------------------
    // Step 5: Mate links — colored by quality, dashed if ended
    // -----------------------------------------------------------------------

    const mateLinks_: dia.Link[] = coupleInfos.map(({ fromId, toId, unionId }) => {
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
        return link;
    });

    if (mateLinks_.length > 0) graph.addCells(mateLinks_);
}
