import { dia } from '@joint/core';
import { MalePerson, FemalePerson, OtherPerson, UnknownPerson } from './shapes';
import type { Person } from './data';

export function createPersonElement(person: Person): dia.Element {
    const ShapeClass =
        person.sex === 'M' ? MalePerson :
        person.sex === 'F' ? FemalePerson :
        person.sex === 'O' ? OtherPerson :
        UnknownPerson;

    const nameText = person.age !== undefined
        ? `${person.name || '(unnamed)'}, ${person.age}`
        : (person.name || '(unnamed)');

    return new ShapeClass({
        id: String(person.id),
        attrs: {
            root: { title: person.name },
            name: { text: nameText },
        },
    });
}

