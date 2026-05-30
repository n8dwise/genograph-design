import { dia } from '@joint/core';
import { MalePerson, FemalePerson, OtherPerson, UnknownPerson } from './shapes';
import type { Person, LayoutParentChildLink } from './data';

export function createPersonElement(person: Person): dia.Element {
    const ShapeClass =
        person.sex === 'M' ? MalePerson :
        person.sex === 'F' ? FemalePerson :
        person.sex === 'O' ? OtherPerson :
        UnknownPerson;

    const el = new ShapeClass({
        id: String(person.id),
        attrs: {
            root: { title: person.name },
            name: { text: person.name || '(unnamed)' },
        },
    });

    if (person.age !== undefined) {
        el.attr('age/text', `age ${person.age}`);
        el.attr('age/opacity', 1);
        el.attr('name/y', 'calc(0.30*h)');
    }

    return el;
}

export function buildFamilyTree(
    persons: Person[],
    parentChildLinks: LayoutParentChildLink[],
): dia.Graph {
    const familyTree = new dia.Graph();
    familyTree.resetCells([
        ...persons.map(p => new dia.Element({ id: String(p.id), type: 'family-element' })),
        ...parentChildLinks.map(rel => new dia.Link({
            type: 'family-link',
            source: { id: String(rel.parentId) },
            target: { id: String(rel.childId) },
        })),
    ]);
    return familyTree;
}
