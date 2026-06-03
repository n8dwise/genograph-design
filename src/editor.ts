import type { FamilyData, Person, Union, Bond, BondType, FamilyRelation, FamilyRelationType, RelationshipQuality, UnionStatus, UnionType } from './data';
import { nextPersonId, nextUnionId, nextBondId, nextFamilyRelationId, BOND_LABELS, FAMILY_RELATION_LABELS } from './data';

type ChangeCallback = (data: FamilyData) => void;

// ── State ─────────────────────────────────────────────────────────────────────

let _data: FamilyData = { persons: [], unions: [] };
let _onChange: ChangeCallback = () => {};
let _openPersonId: number | null = null;
let _openUnionId: string | null = null;
let _openFamilyRelationId: string | null = null;

export function initEditor(data: FamilyData, onChange: ChangeCallback) {
    _data = data;
    _onChange = onChange;
    _openPersonId = null;
    _openUnionId = null;
    _openFamilyRelationId = null;
    renderPeopleList();
    renderUnionsList();
    renderFamilyRelationsList();
    renderBondsList();
}

export function setEditorData(data: FamilyData) {
    _data = data;
    _openPersonId = null;
    _openUnionId = null;
    _openFamilyRelationId = null;
    renderPeopleList();
    renderUnionsList();
    renderFamilyRelationsList();
    renderBondsList();
}

export function openPersonInEditor(id: number) {
    _openPersonId = id;
    _openUnionId = null;
    _openFamilyRelationId = null;
    _openBondId = null;
    renderPeopleList();
    renderUnionsList();
    renderFamilyRelationsList();
    renderBondsList();
    requestAnimationFrame(() => {
        document.querySelector('#people-list .active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

export function openUnionInEditor(id: string) {
    _openUnionId = id;
    _openPersonId = null;
    _openFamilyRelationId = null;
    _openBondId = null;
    renderPeopleList();
    renderUnionsList();
    renderFamilyRelationsList();
    renderBondsList();
    requestAnimationFrame(() => {
        document.querySelector('#unions-list .active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

// ── People ────────────────────────────────────────────────────────────────────

function renderPeopleList() {
    const list = document.getElementById('people-list')!;
    list.innerHTML = '';

    // Primary subject always first
    const sorted = [..._data.persons].sort((a, b) => {
        if (a.isIndexPerson) return -1;
        if (b.isIndexPerson) return 1;
        return 0;
    });

    for (const person of sorted) {
        const isPrimary = !!person.isIndexPerson;
        const row = document.createElement('div');
        row.className = 'list-item' + (person.id === _openPersonId ? ' active' : '');

        const badge = document.createElement('span');
        badge.className = `list-item-badge sex-${person.sex === '?' ? 'unknown' : person.sex}`;

        const label = document.createElement('span');
        label.className = 'list-item-label';
        label.textContent = person.name || '(unnamed)';
        if (isPrimary) label.textContent += ' ★';
        if (person.deceased) label.style.textDecoration = 'line-through';

        row.append(badge, label);

        if (!isPrimary) {
            const del = document.createElement('button');
            del.className = 'btn-delete';
            del.textContent = '✕';
            del.title = 'Remove person';
            del.addEventListener('click', e => { e.stopPropagation(); deletePerson(person.id); });
            row.appendChild(del);
        }

        row.addEventListener('click', () => togglePersonForm(person.id));
        list.appendChild(row);

        if (person.id === _openPersonId) {
            list.appendChild(buildPersonForm(person));
        }
    }
}

function togglePersonForm(id: number) {
    _openPersonId = _openPersonId === id ? null : id;
    _openUnionId = null;
    renderPeopleList();
    renderUnionsList();
}

function buildPersonForm(person: Person): HTMLElement {
    const isPrimary = !!person.isIndexPerson;
    const form = document.createElement('div');
    form.className = 'edit-form';

    // Name
    const nameLabel = document.createElement('label');
    nameLabel.textContent = isPrimary ? 'Name (primary subject)' : 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = person.name;
    nameInput.placeholder = 'Full name';

    // Sex buttons
    const sexLabel = document.createElement('label');
    sexLabel.textContent = 'Gender';
    const sexOptions = document.createElement('div');
    sexOptions.className = 'sex-options';
    const sexValues: Array<[Person['sex'], string]> = [['M', 'Male'], ['F', 'Female'], ['O', 'Other'], ['?', '?']];
    let currentSex = person.sex;
    const sexBtns: HTMLButtonElement[] = [];
    for (const [val, lbl] of sexValues) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `sex-btn${currentSex === val ? ` active-${val === '?' ? 'unknown' : val}` : ''}`;
        btn.textContent = lbl;
        btn.dataset.val = val;
        btn.addEventListener('click', () => {
            currentSex = val;
            sexBtns.forEach(b => {
                const v = b.dataset.val as Person['sex'];
                b.className = `sex-btn${v === currentSex ? ` active-${v === '?' ? 'unknown' : v}` : ''}`;
            });
        });
        sexBtns.push(btn);
        sexOptions.appendChild(btn);
    }

    // Age
    const ageLabel = document.createElement('label');
    ageLabel.textContent = 'Age (optional)';
    const ageInput = document.createElement('input');
    ageInput.type = 'text';
    ageInput.value = person.age !== undefined ? String(person.age) : '';
    ageInput.placeholder = 'e.g. 45';
    ageInput.maxLength = 3;

    // Deceased
    const deceasedRow = document.createElement('label');
    deceasedRow.className = 'checkbox-row';
    const deceasedCheck = document.createElement('input');
    deceasedCheck.type = 'checkbox';
    deceasedCheck.checked = !!person.deceased;
    deceasedRow.append(deceasedCheck, document.createTextNode('Deceased'));

    // Buttons
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-form';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-form';
    cancelBtn.textContent = 'Cancel';

    saveBtn.addEventListener('click', () => {
        const ageVal = parseInt(ageInput.value.trim(), 10);
        const updated: Person = {
            ...person,
            name: nameInput.value.trim() || '(unnamed)',
            sex: currentSex,
            age: isNaN(ageVal) ? undefined : ageVal,
            deceased: deceasedCheck.checked || undefined,
        };
        const idx = _data.persons.findIndex(p => p.id === person.id);
        if (idx !== -1) _data.persons[idx] = updated;
        _openPersonId = null;
        _onChange(_data);
        renderPeopleList();
    });

    cancelBtn.addEventListener('click', () => { _openPersonId = null; renderPeopleList(); });

    actions.append(saveBtn, cancelBtn);
    form.append(nameLabel, nameInput, sexLabel, sexOptions, ageLabel, ageInput, deceasedRow, actions);
    return form;
}

export function addPerson() {
    const id = nextPersonId(_data);
    const person: Person = { id, name: '', sex: '?' };
    _data.persons.push(person);
    _openPersonId = id;
    _openUnionId = null;
    renderPeopleList();
    renderUnionsList();
}

function deletePerson(id: number) {
    _data.persons = _data.persons.filter(p => p.id !== id);
    for (const u of _data.unions) u.children = (u.children ?? []).filter(c => c !== id);
    _data.unions = _data.unions.filter(u => !u.partners.includes(id));
    if (_openPersonId === id) _openPersonId = null;
    _onChange(_data);
    renderPeopleList();
    renderUnionsList();
}

// ── Unions ────────────────────────────────────────────────────────────────────

function renderUnionsList() {
    const list = document.getElementById('unions-list')!;
    list.innerHTML = '';

    for (const union of _data.unions) {
        const p0 = _data.persons.find(p => p.id === union.partners[0]);
        const p1 = _data.persons.find(p => p.id === union.partners[1]);
        const label = `${p0?.name || '?'} & ${p1?.name || '?'}`;
        const quality = union.quality ?? 'neutral';

        const row = document.createElement('div');
        row.className = 'list-item' + (union.id === _openUnionId ? ' active' : '');

        const badge = document.createElement('span');
        badge.className = `list-item-badge quality-${quality}`;

        const lbl = document.createElement('span');
        lbl.className = 'list-item-label';
        lbl.textContent = label;
        if (union.status && union.status !== 'active') lbl.textContent += ` (${union.status})`;

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '✕';
        del.addEventListener('click', e => { e.stopPropagation(); deleteUnion(union.id); });

        row.append(badge, lbl, del);
        row.addEventListener('click', () => toggleUnionForm(union.id));
        list.appendChild(row);

        if (union.id === _openUnionId) list.appendChild(buildUnionForm(union));
    }
}

function toggleUnionForm(id: string) {
    _openUnionId = _openUnionId === id ? null : id;
    _openPersonId = null;
    renderPeopleList();
    renderUnionsList();
}

function buildQualityOptions(
    current: RelationshipQuality | null,
): { el: HTMLElement; getValue: () => RelationshipQuality | null } {
    const container = document.createElement('div');
    container.className = 'quality-options';
    const values: Array<[RelationshipQuality | null, string]> = [
        ['green', '🟢 Good'], ['yellow', '🟡 Strained'], ['red', '🔴 Conflicted'], [null, '— None'],
    ];
    let selected = current;
    const btns: HTMLButtonElement[] = [];
    for (const [val, lbl] of values) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const ak = val === null ? 'none' : val;
        btn.className = `quality-btn${selected === val ? ` active-${ak}` : ''}`;
        btn.textContent = lbl;
        btn.dataset.val = val ?? '__none__';
        btn.addEventListener('click', () => {
            selected = val;
            btns.forEach(b => {
                const v = b.dataset.val === '__none__' ? null : b.dataset.val as RelationshipQuality;
                b.className = `quality-btn${v === selected ? ` active-${v === null ? 'none' : v}` : ''}`;
            });
        });
        btns.push(btn);
        container.appendChild(btn);
    }
    return { el: container, getValue: () => selected };
}

function buildUnionForm(union: Union): HTMLElement {
    const form = document.createElement('div');
    form.className = 'edit-form';

    const p0Label = document.createElement('label'); p0Label.textContent = 'Partner 1';
    const p0Select = buildPersonSelect(union.partners[0]);
    const p1Label = document.createElement('label'); p1Label.textContent = 'Partner 2';
    const p1Select = buildPersonSelect(union.partners[1]);

    const typeLabel = document.createElement('label'); typeLabel.textContent = 'Type';
    const typeSelect = document.createElement('select');
    const typeOptions: Array<[UnionType, string]> = [
        ['married', 'Married'], ['cohabiting', 'Cohabiting / Partnered'],
        ['affair', 'Affair'], ['other', 'Other (custom label)'], ['unknown', 'Unknown'],
    ];
    for (const [val, lbl] of typeOptions) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if ((union.type ?? 'married') === val) opt.selected = true;
        typeSelect.appendChild(opt);
    }

    const otherLabelInput = document.createElement('input');
    otherLabelInput.type = 'text';
    otherLabelInput.placeholder = 'Custom relationship label…';
    otherLabelInput.value = union.label ?? '';
    otherLabelInput.style.display = union.type === 'other' ? '' : 'none';
    typeSelect.addEventListener('change', () => {
        otherLabelInput.style.display = typeSelect.value === 'other' ? '' : 'none';
    });

    const statusLabel = document.createElement('label'); statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    const statusOptions: Array<[UnionStatus, string]> = [
        ['active', 'Active / Together'], ['separated', 'Separated'], ['divorced', 'Divorced'],
        ['widowed', 'Widowed (one partner deceased)'], ['deceased', 'Both Deceased'],
    ];
    for (const [val, lbl] of statusOptions) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if ((union.status ?? 'active') === val) opt.selected = true;
        statusSelect.appendChild(opt);
    }

    // Auto-default type to "married" when divorced is selected and type is still unknown
    statusSelect.addEventListener('change', () => {
        if (statusSelect.value === 'divorced' && typeSelect.value === 'unknown') {
            typeSelect.value = 'married';
        }
    });

    const qualityLabel = document.createElement('label'); qualityLabel.textContent = 'Relationship quality';
    const qualityWidget = buildQualityOptions(union.quality ?? null);

    const childLabel = document.createElement('label'); childLabel.textContent = 'Children';
    const childSelect = document.createElement('select');
    childSelect.multiple = true;
    childSelect.style.height = '80px';
    childSelect.style.fontSize = '12px';
    const currentChildren = new Set(union.children ?? []);
    for (const p of _data.persons) {
        if (p.id === union.partners[0] || p.id === union.partners[1]) continue;
        const opt = document.createElement('option');
        opt.value = String(p.id);
        opt.textContent = p.name || '(unnamed)';
        if (currentChildren.has(p.id)) opt.selected = true;
        childSelect.appendChild(opt);
    }
    const childHint = document.createElement('label');
    childHint.textContent = 'Hold Ctrl/Cmd to select multiple';
    childHint.style.cssText = 'font-size:10px;color:#94a3b8;';

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-form'; saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-form'; cancelBtn.textContent = 'Cancel';

    saveBtn.addEventListener('click', () => {
        const p0Id = Number(p0Select.value);
        const p1Id = Number(p1Select.value);
        if (p0Id === p1Id) { alert('Partners must be different people.'); return; }
        const children = Array.from(childSelect.selectedOptions).map(o => Number(o.value));
        const updated: Union = {
            ...union, partners: [p0Id, p1Id],
            type: typeSelect.value as UnionType,
            label: typeSelect.value === 'other' ? otherLabelInput.value.trim() || undefined : undefined,
            status: statusSelect.value as UnionStatus,
            quality: qualityWidget.getValue() ?? undefined, children,
        };
        const idx = _data.unions.findIndex(u => u.id === union.id);
        if (idx !== -1) _data.unions[idx] = updated;
        _openUnionId = null;
        _onChange(_data);
        renderUnionsList();
    });

    cancelBtn.addEventListener('click', () => { _openUnionId = null; renderUnionsList(); });

    actions.append(saveBtn, cancelBtn);
    form.append(
        p0Label, p0Select, p1Label, p1Select,
        typeLabel, typeSelect, otherLabelInput, statusLabel, statusSelect,
        qualityLabel, qualityWidget.el,
        childLabel, childSelect, childHint, actions,
    );
    return form;
}

function buildPersonSelect(selectedId: number): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const p of _data.persons) {
        const opt = document.createElement('option');
        opt.value = String(p.id);
        opt.textContent = (p.name || '(unnamed)') + (p.isIndexPerson ? ' ★' : '');
        if (p.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

export function addUnion() {
    if (_data.persons.length < 2) { alert('Add at least two people before creating a relationship.'); return; }
    const id = nextUnionId(_data);
    const union: Union = {
        id, partners: [_data.persons[0].id, _data.persons[1].id],
        type: 'married', status: 'active', children: [],
    };
    _data.unions.push(union);
    _openUnionId = id;
    _openPersonId = null;
    _onChange(_data);
    renderPeopleList();
    renderUnionsList();
}

function deleteUnion(id: string) {
    _data.unions = _data.unions.filter(u => u.id !== id);
    if (_openUnionId === id) _openUnionId = null;
    _onChange(_data);
    renderUnionsList();
}

// ── Family Relations ──────────────────────────────────────────────────────────

export function renderFamilyRelationsList() {
    const list = document.getElementById('family-relations-list')!;
    list.innerHTML = '';

    for (const rel of (_data.familyRelations ?? [])) {
        const from = _data.persons.find(p => p.id === rel.from);
        const to = _data.persons.find(p => p.id === rel.to);
        const labelText = FAMILY_RELATION_LABELS[rel.type];

        const row = document.createElement('div');
        row.className = 'list-item' + (rel.id === _openFamilyRelationId ? ' active' : '');

        const badge = document.createElement('span');
        badge.className = 'list-item-badge family-relation-badge';

        const lbl = document.createElement('span');
        lbl.className = 'list-item-label';
        lbl.textContent = `${from?.name || '?'} is ${labelText} of ${to?.name || '?'}`;

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '✕';
        del.addEventListener('click', e => { e.stopPropagation(); deleteFamilyRelation(rel.id); });

        row.append(badge, lbl, del);
        row.addEventListener('click', () => {
            _openFamilyRelationId = _openFamilyRelationId === rel.id ? null : rel.id;
            _openPersonId = null;
            _openUnionId = null;
            _openBondId = null;
            renderPeopleList();
            renderUnionsList();
            renderFamilyRelationsList();
            renderBondsList();
        });
        list.appendChild(row);

        if (rel.id === _openFamilyRelationId) list.appendChild(buildFamilyRelationForm(rel));
    }
}

function buildFamilyRelationForm(rel: FamilyRelation): HTMLElement {
    const form = document.createElement('div');
    form.className = 'edit-form';

    // Form reads: "[Person] is a [type] of [Other person]"
    const personLabel = document.createElement('label'); personLabel.textContent = 'Person';
    const fromSelect = buildPersonSelect(rel.from);

    const typeLabel = document.createElement('label'); typeLabel.textContent = 'is a…';
    const typeSelect = document.createElement('select');
    const frTypeOrder: Array<[FamilyRelationType, string]> = [
        ['aunt',         'Aunt'],
        ['uncle',        'Uncle'],
        ['niece',        'Niece'],
        ['nephew',       'Nephew'],
        ['parent',       'Parent (no union)'],
        ['child',        'Child (no union)'],
        ['sibling',      'Sibling (parents not in diagram)'],
        ['half-sibling', 'Half-Sibling (different unions)'],
    ];
    for (const [val, lbl] of frTypeOrder) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if (rel.type === val) opt.selected = true;
        typeSelect.appendChild(opt);
    }

    const ofLabel = document.createElement('label'); ofLabel.textContent = 'of…';
    const toSelect = buildPersonSelect(rel.to);

    const qualityLabel = document.createElement('label'); qualityLabel.textContent = 'Relationship quality';
    const qualityWidget = buildQualityOptions(rel.quality ?? null);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-form'; saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-form'; cancelBtn.textContent = 'Cancel';

    saveBtn.addEventListener('click', () => {
        const updated: FamilyRelation = {
            ...rel,
            from: Number(fromSelect.value),
            to: Number(toSelect.value),
            type: typeSelect.value as FamilyRelationType,
            quality: qualityWidget.getValue() ?? undefined,
        };
        if (updated.from === updated.to) { alert('Person and "of" must be different people.'); return; }
        const idx = (_data.familyRelations ?? []).findIndex(r => r.id === rel.id);
        if (idx !== -1) _data.familyRelations![idx] = updated;
        _openFamilyRelationId = null;
        _onChange(_data);
        renderFamilyRelationsList();
    });

    cancelBtn.addEventListener('click', () => { _openFamilyRelationId = null; renderFamilyRelationsList(); });

    actions.append(saveBtn, cancelBtn);
    form.append(personLabel, fromSelect, typeLabel, typeSelect, ofLabel, toSelect, qualityLabel, qualityWidget.el, actions);
    return form;
}

export function addFamilyRelation() {
    if (_data.persons.length < 2) { alert('Add at least two people before adding a family relation.'); return; }
    if (!_data.familyRelations) _data.familyRelations = [];
    const id = nextFamilyRelationId(_data);
    const primary = _data.persons.find(p => p.isIndexPerson) ?? _data.persons[0];
    const nonPrimary = _data.persons.find(p => p.id !== primary.id) ?? _data.persons[1];
    const rel: FamilyRelation = {
        id,
        from: nonPrimary.id,
        to: primary.id,
        type: 'parent',
    };
    _data.familyRelations.push(rel);
    _openFamilyRelationId = id;
    _openPersonId = null;
    _openUnionId = null;
    _openBondId = null;
    _onChange(_data);
    renderPeopleList();
    renderUnionsList();
    renderFamilyRelationsList();
    renderBondsList();
}

function deleteFamilyRelation(id: string) {
    _data.familyRelations = (_data.familyRelations ?? []).filter(r => r.id !== id);
    if (_openFamilyRelationId === id) _openFamilyRelationId = null;
    _onChange(_data);
    renderFamilyRelationsList();
}

// ── Bonds ─────────────────────────────────────────────────────────────────────

let _openBondId: string | null = null;

export function renderBondsList() {
    const list = document.getElementById('bonds-list')!;
    list.innerHTML = '';

    for (const bond of (_data.bonds ?? [])) {
        const from = _data.persons.find(p => p.id === bond.from);
        const to = _data.persons.find(p => p.id === bond.to);
        const labelText = bond.type === 'other' && bond.label ? bond.label : BOND_LABELS[bond.type];
        const display = `${from?.name || '?'} → ${to?.name || '?'}`;

        const row = document.createElement('div');
        row.className = 'list-item' + (bond.id === _openBondId ? ' active' : '');

        const badge = document.createElement('span');
        badge.className = 'list-item-badge';
        badge.style.background = '#7c3aed';

        const lbl = document.createElement('span');
        lbl.className = 'list-item-label';
        lbl.textContent = `${display} (${labelText})`;

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '✕';
        del.addEventListener('click', e => { e.stopPropagation(); deleteBond(bond.id); });

        row.append(badge, lbl, del);
        row.addEventListener('click', () => {
            _openBondId = _openBondId === bond.id ? null : bond.id;
            _openPersonId = null;
            _openUnionId = null;
            renderPeopleList();
            renderUnionsList();
            renderBondsList();
        });
        list.appendChild(row);

        if (bond.id === _openBondId) list.appendChild(buildBondForm(bond));
    }
}

function buildBondForm(bond: Bond): HTMLElement {
    const form = document.createElement('div');
    form.className = 'edit-form';

    const fromLabel = document.createElement('label'); fromLabel.textContent = 'From';
    const fromSelect = buildPersonSelect(bond.from);
    const toLabel = document.createElement('label'); toLabel.textContent = 'To';
    const toSelect = buildPersonSelect(bond.to);

    const typeLabel = document.createElement('label'); typeLabel.textContent = 'Connection type';
    const typeSelect = document.createElement('select');
    for (const [val, lbl] of Object.entries(BOND_LABELS) as Array<[BondType, string]>) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if (bond.type === val) opt.selected = true;
        typeSelect.appendChild(opt);
    }

    const customLabel = document.createElement('label'); customLabel.textContent = 'Custom label (if "Other")';
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.value = bond.label ?? '';
    customInput.placeholder = 'e.g. AA Sponsor';

    const bondQualityLabel = document.createElement('label'); bondQualityLabel.textContent = 'Relationship quality';
    const bondQualityWidget = buildQualityOptions(bond.quality ?? null);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-form'; saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-form'; cancelBtn.textContent = 'Cancel';

    saveBtn.addEventListener('click', () => {
        const updated: Bond = {
            ...bond,
            from: Number(fromSelect.value),
            to: Number(toSelect.value),
            type: typeSelect.value as BondType,
            label: customInput.value.trim() || undefined,
            quality: bondQualityWidget.getValue() ?? undefined,
        };
        if (updated.from === updated.to) { alert('From and To must be different people.'); return; }
        const idx = (_data.bonds ?? []).findIndex(b => b.id === bond.id);
        if (idx !== -1) _data.bonds![idx] = updated;
        _openBondId = null;
        _onChange(_data);
        renderBondsList();
    });

    cancelBtn.addEventListener('click', () => { _openBondId = null; renderBondsList(); });

    actions.append(saveBtn, cancelBtn);
    form.append(fromLabel, fromSelect, toLabel, toSelect, typeLabel, typeSelect, customLabel, customInput, bondQualityLabel, bondQualityWidget.el, actions);
    return form;
}

export function addBond() {
    if (_data.persons.length < 2) { alert('Add at least two people before creating a connection.'); return; }
    if (!_data.bonds) _data.bonds = [];
    const id = nextBondId(_data);
    const bond: Bond = {
        id,
        from: _data.persons[0].id,
        to: _data.persons[1].id,
        type: 'important-adult',
    };
    _data.bonds.push(bond);
    _openBondId = id;
    _openPersonId = null;
    _openUnionId = null;
    _onChange(_data);
    renderPeopleList();
    renderUnionsList();
    renderBondsList();
}

function deleteBond(id: string) {
    _data.bonds = (_data.bonds ?? []).filter(b => b.id !== id);
    if (_openBondId === id) _openBondId = null;
    _onChange(_data);
    renderBondsList();
}
