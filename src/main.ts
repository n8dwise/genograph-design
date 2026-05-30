import { dia, shapes } from '@joint/core';
import { MalePerson, FemalePerson, OtherPerson, UnknownPerson, ParentChildLink, MateLink, BondLink } from './shapes';
import { colors, sizes, linkStyleOverrides } from './theme';
import { toLayoutPersonNodes, getParentChildLinks, getMateLinks, DEFAULT_FAMILY_DATA, BOND_LABELS } from './data';
import type { FamilyData } from './data';
import { layoutGenogram } from './layout';
import { applyPersonHighlighters } from './highlighters';
import { createPersonElement } from './utils';
import { initEditor, setEditorData, addPerson, addUnion, addBond } from './editor';
import { saveFile, loadFile, exportPng } from './storage';
import './styles.css';

// ── JointJS setup ─────────────────────────────────────────────────────────────

const cellNamespace = {
    ...shapes,
    genogram: { MalePerson, FemalePerson, OtherPerson, UnknownPerson, ParentChildLink, MateLink, BondLink },
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
    layoutGenogram({ graph, elements, persons: layoutPersons, parentChildLinks, mateLinks, unions: data.unions, sizes: layoutSizes, linkShapes: { ParentChildLink, MateLink } });
    applyPersonHighlighters(paper, data.persons);

    // Render bonds (non-structural labeled connections)
    const bondCells = (data.bonds ?? []).map(bond => {
        const labelText = bond.type === 'other' && bond.label ? bond.label : BOND_LABELS[bond.type];
        const link = new BondLink({
            source: { id: String(bond.from) },
            target: { id: String(bond.to) },
        });
        link.labels([{
            position: { distance: 0.5 },
            attrs: {
                text: { text: labelText, fontSize: 10, fill: '#5b21b6', fontFamily: 'system-ui, sans-serif' },
                rect: { fill: '#f5f3ff', stroke: '#c4b5fd', strokeWidth: 1, rx: 3, ry: 3 },
            },
        }]);
        return link;
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
document.getElementById('btn-add-bond')!.addEventListener('click', () => addBond());

// ── Init ──────────────────────────────────────────────────────────────────────

initEditor(currentData, handleDataChange);
showSetupScreen();
