import { dia } from '@joint/core';
import { colors, sizes } from './theme';
import type { Person } from './data';

class DeceasedHighlighter extends dia.HighlighterView {
    preinitialize() {
        this.tagName = 'path';
        this.attributes = {
            stroke: colors.dark,
            strokeWidth: 2,
            strokeLinecap: 'round',
            fill: 'none',
            opacity: '0.6',
        };
    }

    protected highlight(elementView: dia.ElementView<dia.Element>) {
        const { width, height } = elementView.model.size();
        const margin = 5;
        const size = 13;
        const x1 = width - margin - size;
        const y1 = height - margin - size;
        const x2 = width - margin;
        const y2 = height - margin;
        this.el.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y1} L ${x1} ${y2}`);
    }
}

class IndexPersonHighlighter extends dia.HighlighterView {
    preinitialize() {
        this.tagName = 'rect';
        this.attributes = {
            stroke: colors.dark,
            strokeWidth: 3,
            fill: 'none',
            rx: '6',
            ry: '6',
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

export function applyPersonHighlighters(paper: dia.Paper, persons: Person[]) {
    for (const person of persons) {
        const view = paper.findViewByModel(String(person.id));
        if (!view) continue;
        if (person.deceased) {
            DeceasedHighlighter.add(view, 'body', 'deceased-cross', { z: 5 });
        }
        if (person.isIndexPerson) {
            IndexPersonHighlighter.add(view, 'body', 'index-person', { z: 5 });
        }
    }
}
