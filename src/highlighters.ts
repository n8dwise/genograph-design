import { dia } from '@joint/core';
import { colors, sizes } from './theme';
import type { Person } from './data';

const { deceasedCrossInset } = sizes;

class DeceasedHighlighter extends dia.HighlighterView {
    preinitialize() {
        this.tagName = 'path';
        this.attributes = {
            stroke: colors.dark,
            strokeWidth: 2.5,
            strokeLinecap: 'round',
            fill: 'none',
        };
    }

    protected highlight(elementView: dia.ElementView<dia.Element>) {
        const { width, height } = elementView.model.size();
        const p = deceasedCrossInset;
        this.el.setAttribute(
            'd',
            `M ${p} ${p} L ${width - p} ${height - p} M ${width - p} ${p} L ${p} ${height - p}`,
        );
    }
}

class IndexPersonHighlighter extends dia.HighlighterView {
    preinitialize() {
        this.tagName = 'rect';
        this.attributes = {
            stroke: colors.dark,
            strokeWidth: 3,
            fill: 'none',
            rx: '4',
            ry: '4',
        };
    }

    protected highlight(elementView: dia.ElementView<dia.Element>) {
        const { width, height } = elementView.model.size();
        const p = -5;
        this.el.setAttribute('x', String(p));
        this.el.setAttribute('y', String(p));
        this.el.setAttribute('width', String(width - p * 2));
        this.el.setAttribute('height', String(height - p * 2));
    }
}

const DECEASED_ID = 'deceased-cross';
const INDEX_ID = 'index-person';

export function applyPersonHighlighters(paper: dia.Paper, persons: Person[]) {
    for (const person of persons) {
        const view = paper.findViewByModel(String(person.id));
        if (!view) continue;
        if (person.dod) {
            DeceasedHighlighter.add(view, 'body', DECEASED_ID, { z: 5 });
        }
        if (person.isIndexPerson) {
            IndexPersonHighlighter.add(view, 'body', INDEX_ID, { z: 5 });
        }
    }
}
