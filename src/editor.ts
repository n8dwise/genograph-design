import type { FamilyData, Person, Union, RelationshipQuality, UnionStatus, UnionType } from './data';
import { nextPersonId, nextUnionId } from './data';

type ChangeCallback = (data: FamilyData) => void;

// ── State ─────────────────────────────────────────────────────────────────────

let _data: FamilyData = { persons: [], unions: [] };
let _onChange: ChangeCallback = () => {};
let _openPersonId: number | null = null;
let _openUnionId: string | null = null;

export function initEditor(data: FamilyData, onChange: ChangeCallback) {
    _data = data;
    _onChange = onChange;
    _openPersonId = null;
    _openUnionId = null;
    renderPeopleList();
    renderUnionsList();
}

export function setEditorData(data: FamilyData) {
    _data = data;
    _openPersonId = null;
    _openUnionId = null;
    renderPeopleList();
    renderUnionsList();
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
        ['affair', 'Affair'], ['unknown', 'Unknown'],
    ];
    for (const [val, lbl] of typeOptions) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if ((union.type ?? 'married') === val) opt.selected = true;
        typeSelect.appendChild(opt);
    }

    const statusLabel = document.createElement('label'); statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    const statusOptions: Array<[UnionStatus, string]> = [
        ['active', 'Active / Together'], ['separated', 'Separated'], ['divorced', 'Divorced'],
    ];
    for (const [val, lbl] of statusOptions) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = lbl;
        if ((union.status ?? 'active') === val) opt.selected = true;
        statusSelect.appendChild(opt);
    }

    const qualityLabel = document.createElement('label'); qualityLabel.textContent = 'Relationship quality';
    const qualityOptions = document.createElement('div');
    qualityOptions.className = 'quality-options';
    const qualityValues: Array<[RelationshipQuality | null, string]> = [
        ['green', '🟢 Good'], ['yellow', '🟡 Strained'], ['red', '🔴 Conflicted'], [null, '— None'],
    ];
    let currentQuality: RelationshipQuality | null = union.quality ?? null;
    const qualityBtns: HTMLButtonElement[] = [];
    for (const [val, lbl] of qualityValues) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const ak = val === null ? 'none' : val;
        btn.className = `quality-btn${currentQuality === val ? ` active-${ak}` : ''}`;
        btn.textContent = lbl;
        btn.dataset.val = val ?? '__none__';
        btn.addEventListener('click', () => {
            currentQuality = val;
            qualityBtns.forEach(b => {
                const v = b.dataset.val === '__none__' ? null : b.dataset.val as RelationshipQuality;
                b.className = `quality-btn${v === currentQuality ? ` active-${v === null ? 'none' : v}` : ''}`;
            });
        });
        qualityBtns.push(btn);
        qualityOptions.appendChild(btn);
    }

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
            status: statusSelect.value as UnionStatus,
            quality: currentQuality ?? undefined, children,
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
        typeLabel, typeSelect, statusLabel, statusSelect,
        qualityLabel, qualityOptions,
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
