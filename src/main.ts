import { dia, shapes } from '@joint/core';
import {
    MalePerson, FemalePerson, OtherPerson, UnknownPerson,
    ParentChildLink, MateLink, UnionBox,
} from './shapes';
import { colors, sizes, linkStyleOverrides } from './theme';
import {
    toLayoutPersonNodes, getParentChildLinks, getMateLinks, DEFAULT_FAMILY_DATA,
} from './data';
import type { FamilyData } from './data';
import { layoutGenogram } from './layout';
import { applyPersonHighlighters } from './highlighters';
import { createPersonElement } from './utils';
import { initEditor, setEditorData, addPerson, addUnion } from './editor';
import { saveFile, loadFile, exportPng } from './storage';
import './styles.css';

// ── JointJS setup ─────────────────────────────────────────────────────────────

const cellNamespace = {
    ...shapes,
    genogram: {
        MalePerson, FemalePerson, OtherPerson, UnknownPerson,
        ParentChildLink, MateLink, UnionBox,
    },
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
    const elements = data.persons.map(createPersonElement);
    const layoutSizes = { ...sizes, ...linkStyleOverrides['fan'] };

    graph.resetCells([]);

    layoutGenogram({
        graph,
        elements,
        persons: layoutPersons,
        parentChildLinks,
        mateLinks,
        unions: data.unions,
        sizes: layoutSizes,
        linkShapes: { ParentChildLink, MateLink, UnionBox },
    });

    applyPersonHighlighters(paper, data.persons);

    paper.freeze();
    paper.unfreeze();
    paper.transformToFitContent({
        padding: sizes.paperPadding,
        verticalAlign: 'top',
        horizontalAlign: 'middle',
        useModelGeometry: true,
    });
}

// ── Toolbar handlers ──────────────────────────────────────────────────────────

document.getElementById('tree-title')!.addEventListener('input', (e) => {
    const title = (e.target as HTMLInputElement).value;
    if (!currentData.meta) currentData.meta = {};
    currentData.meta.title = title;
});

document.getElementById('btn-new')!.addEventListener('click', () => {
    if (currentData.persons.length > 0) {
        if (!confirm('Start a new diagram? Unsaved changes will be lost.')) return;
    }
    currentData = structuredClone(DEFAULT_FAMILY_DATA);
    (document.getElementById('tree-title') as HTMLInputElement).value = '';
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

document.getElementById('btn-save')!.addEventListener('click', () => {
    saveFile(currentData);
});

document.getElementById('btn-export-png')!.addEventListener('click', () => {
    const name = currentData.meta?.title ?? 'genograph';
    exportPng(paper, name);
});

document.getElementById('btn-add-person')!.addEventListener('click', () => {
    addPerson();
});

document.getElementById('btn-add-union')!.addEventListener('click', () => {
    addUnion();
});

// ── Init ──────────────────────────────────────────────────────────────────────

function handleDataChange(data: FamilyData) {
    currentData = data;
    render(data);
}

initEditor(currentData, handleDataChange);
render(currentData);
