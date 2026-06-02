import { dia, shapes } from '@joint/core';
import { MalePerson, FemalePerson, OtherPerson, UnknownPerson, ParentChildLink, MateLink, BondLink, FamilyRelationLink } from './shapes';
import { colors, sizes, linkStyleOverrides, qualityStrokeColor } from './theme';
import { toLayoutPersonNodes, getParentChildLinks, getMateLinks, DEFAULT_FAMILY_DATA, BOND_LABELS, FAMILY_RELATION_LABELS } from './data';
import exampleData from './families/example.json';
import type { FamilyData } from './data';
import { layoutGenogram } from './layout';
import { applyPersonHighlighters } from './highlighters';
import { createPersonElement } from './utils';
import { initEditor, setEditorData, addPerson, addUnion, addFamilyRelation, addBond } from './editor';
import { saveFile, loadFile, exportPng } from './storage';
import './styles.css';

// ── JointJS setup ─────────────────────────────────────────────────────────────

const cellNamespace = {
    ...shapes,
    genogram: { MalePerson, FemalePerson, OtherPerson, UnknownPerson, ParentChildLink, MateLink, FamilyRelationLink, BondLink },
};

const graph = new dia.Graph({}, { cellNamespace });

const paper = new dia.Paper({
    model: graph,
    cellViewNamespace: cellNamespace,
    width: '100%',
    height: '100%',
    gridSize: 1,
    interactive: false,
    async: true,
    frozen: true,
    autoFreeze: true,
    background: { color: colors.paperBackground },
    defaultConnector: { name: 'straight' },
    defaultConnectionPoint: { name: 'rectangle', args: { useModelGeometry: true } },
    defaultAnchor: { name: 'center', args: { useModelGeometry: true } },
});

document.getElementById('paper-container')!.appendChild(paper.el);

// ── Render ────────────────────────────────────────────────────────────────────

let currentData: FamilyData = structuredClone(DEFAULT_FAMILY_DATA);

function render(data: FamilyData) {
    currentData = data;
    const empty = document.getElementById('diagram-empty')!;

    if (data.persons.length === 0) {
        graph.resetCells([]);
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    const layoutPersons = toLayoutPersonNodes(data);
    const parentChildLinks = getParentChildLinks(data);
    const mateLinks = getMateLinks(data);
    const layoutSizes = { ...sizes, ...linkStyleOverrides['orthogonal'] };

    // Structural persons: in a union, or connected via parent/child family relation, or a union child.
    // Peripheral persons (siblings, uncles, bond-only): kept out of dagre, positioned post-layout.
    const structuralIds = new Set<number>();
    data.unions.forEach(u => {
        u.partners.forEach(id => structuralIds.add(id));
        (u.children ?? []).forEach(id => structuralIds.add(id));
    });
    (data.familyRelations ?? []).forEach(r => {
        if (r.type === 'parent' || r.type === 'child') {
            structuralIds.add(r.from);
            structuralIds.add(r.to);
        }
    });

    const structuralPersons = data.persons.filter(p => structuralIds.has(p.id));
    const peripheralPersons = data.persons.filter(p => !structuralIds.has(p.id));
    const elements = structuralPersons.map(createPersonElement);
    const peripheralElements = peripheralPersons.map(createPersonElement);

    graph.resetCells([]);
    layoutGenogram({ graph, elements, persons: layoutPersons, parentChildLinks, mateLinks, unions: data.unions, familyRelations: data.familyRelations, sizes: layoutSizes, linkStyle: 'orthogonal', linkShapes: { ParentChildLink, MateLink } });

    // Position and add peripheral elements based on their closest family relation or bond anchor.
    // Track rightmost occupied x per y-row to avoid overlap.
    const rowRightEdge = new Map<number, number>();
    function placePeripheral(el: dia.Element, anchorEl: dia.Element, side: 'left' | 'right') {
        const ap = anchorEl.position();
        const y = ap.y;

        // Scan all existing elements at this Y level to get true row extents
        // (catches persons placed inside multi-partner containers, not just the anchor).
        let rowLeft = ap.x;
        let rowRight = ap.x + anchorEl.size().width;
        for (const existing of graph.getElements()) {
            const ep = existing.position();
            if (Math.abs(ep.y - y) < 5) {
                rowLeft  = Math.min(rowLeft,  ep.x);
                rowRight = Math.max(rowRight, ep.x + existing.size().width);
            }
        }

        if (side === 'left') {
            const left = rowRightEdge.get(-(y + 1)) ?? (rowLeft - layoutSizes.symbolGap);
            const x = left - layoutSizes.symbolWidth;
            el.position(x, y);
            rowRightEdge.set(-(y + 1), x - layoutSizes.symbolGap);
        } else {
            const right = rowRightEdge.get(y) ?? (rowRight + layoutSizes.symbolGap);
            el.position(right, y);
            rowRightEdge.set(y, right + layoutSizes.symbolWidth + layoutSizes.symbolGap);
        }
        graph.addCell(el);
    }

    const supportPersonElements: dia.Element[] = [];

    for (const pEl of peripheralElements) {
        const pid = Number(pEl.id);
        const rels = (data.familyRelations ?? []).filter(r => r.from === pid || r.to === pid);

        // Prefer sibling relation → place next to the sibling
        const siblingRel = rels.find(r => r.type === 'sibling' && r.from === pid);
        if (siblingRel) {
            const anchorEl = graph.getCell(String(siblingRel.to)) as dia.Element | null;
            if (anchorEl) { placePeripheral(pEl, anchorEl, 'left'); continue; }
        }

        // Uncle/aunt → place next to the reference person's parent
        const uncleRel = rels.find(r => (r.type === 'uncle' || r.type === 'aunt') && r.from === pid);
        if (uncleRel) {
            const parentRel = (data.familyRelations ?? []).find(r => r.to === uncleRel.to && r.type === 'parent');
            const anchorId = parentRel ? parentRel.from : uncleRel.to;
            const anchorEl = graph.getCell(String(anchorId)) as dia.Element | null;
            if (anchorEl) { placePeripheral(pEl, anchorEl, 'left'); continue; }
        }

        // Bond-only peripheral: show in support network panel below the tree
        const hasBondToGraph = (data.bonds ?? []).some(b =>
            (b.from === pid && graph.getCell(String(b.to))) ||
            (b.to === pid && graph.getCell(String(b.from)))
        );
        if (hasBondToGraph) supportPersonElements.push(pEl);
    }

    // Place support network persons in a centered row below the family tree
    if (supportPersonElements.length > 0) {
        const allTreeEls = graph.getElements();
        const treeBottom = allTreeEls.length > 0
            ? Math.max(...allTreeEls.map(el => el.position().y + el.size().height))
            : 0;
        const treeLeft = allTreeEls.length > 0
            ? Math.min(...allTreeEls.map(el => el.position().x))
            : 0;
        const treeRight = allTreeEls.length > 0
            ? Math.max(...allTreeEls.map(el => el.position().x + el.size().width))
            : 0;

        const supportY = treeBottom + layoutSizes.levelGap * 1.5;
        const totalW = supportPersonElements.length * layoutSizes.symbolWidth
            + (supportPersonElements.length - 1) * layoutSizes.symbolGap;
        let supportX = (treeLeft + treeRight) / 2 - totalW / 2;

        for (const el of supportPersonElements) {
            el.position(supportX, supportY);
            graph.addCell(el);
            supportX += layoutSizes.symbolWidth + layoutSizes.symbolGap;
        }
    }

    applyPersonHighlighters(paper, data.persons);

    // Sibling brackets: for siblings not already connected via a shared union T-bar,
    // draw a horizontal bar above both siblings with drops down to each.
    const sharedUnionSiblings = new Set<string>();
    data.unions.forEach(u => {
        const children = u.children ?? [];
        for (let i = 0; i < children.length; i++) {
            for (let j = i + 1; j < children.length; j++) {
                const key = `${Math.min(children[i], children[j])}-${Math.max(children[i], children[j])}`;
                sharedUnionSiblings.add(key);
            }
        }
    });

    const drawnBrackets = new Set<string>();
    const siblingBarOffset = Math.round(sizes.levelGap * 0.25);
    for (const rel of (data.familyRelations ?? [])) {
        if (rel.type !== 'sibling') continue;
        const pairKey = `${Math.min(rel.from, rel.to)}-${Math.max(rel.from, rel.to)}`;
        if (sharedUnionSiblings.has(pairKey)) continue;
        if (drawnBrackets.has(pairKey)) continue;
        drawnBrackets.add(pairKey);

        const aEl = graph.getCell(String(rel.from)) as dia.Element | null;
        const bEl = graph.getCell(String(rel.to)) as dia.Element | null;
        if (!aEl || !bEl) continue;

        const ax = aEl.getCenter().x;
        const bx = bEl.getCenter().x;
        const bracketY = Math.min(aEl.position().y, bEl.position().y) - siblingBarOffset;
        const stroke = qualityStrokeColor(rel.quality);

        const barLink = new ParentChildLink({});
        barLink.source({ x: Math.min(ax, bx), y: bracketY });
        barLink.target({ x: Math.max(ax, bx), y: bracketY });
        barLink.attr('line/stroke', stroke);
        graph.addCell(barLink);

        for (const [id, x] of [[rel.from, ax], [rel.to, bx]] as [number, number][]) {
            const drop = new ParentChildLink({});
            drop.source({ x, y: bracketY });
            drop.target({ id: String(id), anchor: { name: 'top', args: { useModelGeometry: true } } });
            drop.attr('line/stroke', stroke);
            graph.addCell(drop);
        }
    }

    // Render all bonds where both endpoints are on the canvas.
    // Support-panel persons were added above, so their bonds are drawn too.
    const bondCells = (data.bonds ?? []).flatMap(bond => {
        if (!graph.getCell(String(bond.from)) || !graph.getCell(String(bond.to))) return [];
        const labelText = bond.type === 'other' && bond.label ? bond.label : BOND_LABELS[bond.type];
        const opacity = bond.quality === 'green' ? 1.0 : bond.quality === 'yellow' ? 0.7 : bond.quality === 'red' ? 0.5 : 0.85;
        const link = new BondLink({
            source: { id: String(bond.from) },
            target: { id: String(bond.to) },
        });
        link.attr('line/opacity', opacity);
        link.labels([{
            position: { distance: 0.5 },
            attrs: {
                text: { text: labelText, fontSize: 10, fill: '#5b21b6', fontFamily: 'system-ui, sans-serif' },
                rect: { fill: '#f5f3ff', stroke: '#c4b5fd', strokeWidth: 1, rx: 3, ry: 3 },
            },
        }]);
        return [link];
    });
    if (bondCells.length > 0) graph.addCells(bondCells);

    paper.freeze();
    paper.unfreeze();
    paper.transformToFitContent({ padding: sizes.paperPadding, verticalAlign: 'top', horizontalAlign: 'middle', useModelGeometry: true });
}

function handleDataChange(data: FamilyData) {
    currentData = data;
    render(data);
}

// ── Primary subject setup ─────────────────────────────────────────────────────

function showSetupScreen() {
    const empty = document.getElementById('diagram-empty')!;
    empty.classList.remove('hidden');
    empty.innerHTML = `
        <div id="setup-box">
            <h2>Who is the primary subject?</h2>
            <p>This person will be the focus of the diagram.<br>Everyone else is added in relation to them.</p>
            <div class="setup-field">
                <label>Name</label>
                <input id="setup-name" type="text" placeholder="Full name" autocomplete="off" />
            </div>
            <div class="setup-field">
                <label>Gender</label>
                <div class="sex-options" id="setup-sex-options">
                    <button class="sex-btn active-M" data-val="M">Male</button>
                    <button class="sex-btn" data-val="F">Female</button>
                    <button class="sex-btn" data-val="O">Other</button>
                    <button class="sex-btn" data-val="?">?</button>
                </div>
            </div>
            <button id="setup-start">Start Diagram</button>
        </div>
    `;

    let selectedSex: 'M' | 'F' | 'O' | '?' = 'M';
    const sexBtns = empty.querySelectorAll<HTMLButtonElement>('.sex-btn');
    sexBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedSex = btn.dataset.val as typeof selectedSex;
            sexBtns.forEach(b => {
                const v = b.dataset.val!;
                b.className = `sex-btn${v === selectedSex ? ` active-${v === '?' ? 'unknown' : v}` : ''}`;
            });
        });
    });

    empty.querySelector('#setup-start')!.addEventListener('click', () => {
        const name = (empty.querySelector('#setup-name') as HTMLInputElement).value.trim();
        if (!name) { (empty.querySelector('#setup-name') as HTMLInputElement).focus(); return; }
        currentData.persons.push({ id: 1, name, sex: selectedSex, isIndexPerson: true });
        empty.innerHTML = '<p>Add people and relationships<br>to see the diagram.</p>';
        setEditorData(currentData);
        render(currentData);
    });

    (empty.querySelector('#setup-name') as HTMLInputElement).focus();
}

// ── Toolbar handlers ──────────────────────────────────────────────────────────

document.getElementById('tree-title')!.addEventListener('input', e => {
    const title = (e.target as HTMLInputElement).value;
    if (!currentData.meta) currentData.meta = {};
    currentData.meta.title = title;
});

document.getElementById('btn-new')!.addEventListener('click', () => {
    if (currentData.persons.length > 0 && !confirm('Start a new diagram? Unsaved changes will be lost.')) return;
    currentData = structuredClone(DEFAULT_FAMILY_DATA);
    (document.getElementById('tree-title') as HTMLInputElement).value = '';
    setEditorData(currentData);
    graph.resetCells([]);
    showSetupScreen();
});

document.getElementById('btn-sample')!.addEventListener('click', () => {
    if (currentData.persons.length > 0 && !confirm('Load sample data? Unsaved changes will be lost.')) return;
    currentData = structuredClone(exampleData) as unknown as FamilyData;
    (document.getElementById('tree-title') as HTMLInputElement).value = currentData.meta?.title ?? '';
    setEditorData(currentData);
    render(currentData);
});

document.getElementById('btn-load')!.addEventListener('click', () => {
    loadFile().then(data => {
        currentData = data;
        (document.getElementById('tree-title') as HTMLInputElement).value = data.meta?.title ?? '';
        setEditorData(data);
        render(data);
    }).catch(() => {});
});

document.getElementById('btn-save')!.addEventListener('click', () => saveFile(currentData));

document.getElementById('btn-export-png')!.addEventListener('click', () => {
    exportPng(paper, currentData.meta?.title ?? 'genograph');
});

document.getElementById('btn-add-person')!.addEventListener('click', () => addPerson());
document.getElementById('btn-add-union')!.addEventListener('click', () => addUnion());
document.getElementById('btn-add-family-relation')!.addEventListener('click', () => addFamilyRelation());
document.getElementById('btn-add-bond')!.addEventListener('click', () => addBond());

// ── Init ──────────────────────────────────────────────────────────────────────

initEditor(currentData, handleDataChange);
showSetupScreen();
