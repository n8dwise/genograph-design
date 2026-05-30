import { dia, shapes, util } from '@joint/core';
import { colors, sizes, defaultZIndex } from './theme';

const { symbolWidth, symbolHeight } = sizes;

// All person shapes are rectangles — gender is conveyed by fill/stroke color only.
const personMarkup = util.svg`
    <rect @selector="body"/>
    <text @selector="name"/>
    <text @selector="age"/>
`;

function personDefaults(fill: string, stroke: string) {
    return {
        size: { width: symbolWidth, height: symbolHeight },
        z: defaultZIndex.person,
        attrs: {
            body: {
                width: 'calc(w)',
                height: 'calc(h)',
                fill,
                stroke,
                strokeWidth: 2,
                rx: 5,
                ry: 5,
            },
            name: {
                textVerticalAnchor: 'middle' as const,
                textAnchor: 'middle' as const,
                x: 'calc(0.5*w)',
                y: 'calc(0.38*h)',
                fontSize: 12,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: '500' as const,
                fill: colors.dark,
                textWrap: {
                    width: 'calc(w - 10)',
                    maxLineCount: 1,
                    ellipsis: true,
                },
            },
            age: {
                textVerticalAnchor: 'middle' as const,
                textAnchor: 'middle' as const,
                x: 'calc(0.5*w)',
                y: 'calc(0.72*h)',
                fontSize: 11,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fill: colors.dark,
                opacity: 0,
                text: '',
            },
        },
    };
}

export class MalePerson extends dia.Element {
    defaults() {
        return { ...super.defaults, type: 'genogram.MalePerson', ...personDefaults(colors.maleFill, colors.maleStroke) };
    }
    preinitialize() { this.markup = personMarkup; }
}

export class FemalePerson extends dia.Element {
    defaults() {
        return { ...super.defaults, type: 'genogram.FemalePerson', ...personDefaults(colors.femaleFill, colors.femaleStroke) };
    }
    preinitialize() { this.markup = personMarkup; }
}

export class OtherPerson extends dia.Element {
    defaults() {
        return { ...super.defaults, type: 'genogram.OtherPerson', ...personDefaults(colors.otherFill, colors.otherStroke) };
    }
    preinitialize() { this.markup = personMarkup; }
}

export class UnknownPerson extends dia.Element {
    defaults() {
        return { ...super.defaults, type: 'genogram.UnknownPerson', ...personDefaults(colors.unknownFill, colors.unknownStroke) };
    }
    preinitialize() { this.markup = personMarkup; }
}

// --- Link shapes ---

export class ParentChildLink extends shapes.standard.Link {
    defaults() {
        return util.defaultsDeep({
            type: 'genogram.ParentChildLink',
            z: defaultZIndex.parentChildLink,
            attrs: {
                line: {
                    stroke: colors.linkStroke,
                    strokeWidth: 1.5,
                    targetMarker: null,
                },
            },
        }, super.defaults);
    }
}

export class MateLink extends shapes.standard.Link {
    defaults() {
        return util.defaultsDeep({
            type: 'genogram.MateLink',
            z: defaultZIndex.mateLink,
            attrs: {
                line: {
                    stroke: colors.qualityNeutralStroke,
                    strokeWidth: 2.5,
                    targetMarker: null,
                },
            },
        }, super.defaults);
    }
}
