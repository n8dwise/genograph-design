import { dia, shapes, util } from '@joint/core';
import { colors, sizes, defaultZIndex } from './theme';
import type { RelationshipQuality, UnionStatus } from './data';

const commonNameAttrs = () => ({
    name: {
        textVerticalAnchor: 'top' as const,
        textAnchor: 'middle' as const,
        x: 'calc(0.5*w)',
        y: 'calc(h+5)',
        fontSize: 11,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fill: colors.dark,
        textWrap: {
            width: `calc(w+${sizes.nameWrapOverlap * 2})`,
            maxLineCount: sizes.nameMaxLineCount,
            ellipsis: true,
        },
    },
});

// --- Person shapes ---

const rectPersonMarkup = util.svg`
    <rect @selector="body"/>
    <text @selector="name"/>
`;

const circlePersonMarkup = util.svg`
    <ellipse @selector="body"/>
    <text @selector="name"/>
`;

const diamondPersonMarkup = util.svg`
    <polygon @selector="body"/>
    <text @selector="name"/>
`;

const { symbolWidth, symbolHeight } = sizes;

export class MalePerson extends dia.Element {
    defaults() {
        return {
            ...super.defaults,
            type: 'genogram.MalePerson',
            size: { width: symbolWidth, height: symbolHeight },
            z: defaultZIndex.person,
            attrs: {
                body: {
                    width: 'calc(w)',
                    height: 'calc(h)',
                    fill: colors.maleFill,
                    stroke: colors.maleStroke,
                    strokeWidth: 2,
                    rx: 3,
                    ry: 3,
                },
                ...commonNameAttrs(),
            },
        };
    }
    preinitialize() { this.markup = rectPersonMarkup; }
}

export class FemalePerson extends dia.Element {
    defaults() {
        return {
            ...super.defaults,
            type: 'genogram.FemalePerson',
            size: { width: symbolWidth, height: symbolHeight },
            z: defaultZIndex.person,
            attrs: {
                body: {
                    cx: 'calc(0.5*w)',
                    cy: 'calc(0.5*h)',
                    rx: 'calc(0.5*w)',
                    ry: 'calc(0.5*h)',
                    fill: colors.femaleFill,
                    stroke: colors.femaleStroke,
                    strokeWidth: 2,
                },
                ...commonNameAttrs(),
            },
        };
    }
    preinitialize() { this.markup = circlePersonMarkup; }
}

export class OtherPerson extends dia.Element {
    defaults() {
        return {
            ...super.defaults,
            type: 'genogram.OtherPerson',
            size: { width: symbolWidth, height: symbolHeight },
            z: defaultZIndex.person,
            attrs: {
                body: {
                    width: 'calc(w)',
                    height: 'calc(h)',
                    fill: colors.otherFill,
                    stroke: colors.otherStroke,
                    strokeWidth: 2,
                    rx: 'calc(0.5*h)',
                    ry: 'calc(0.5*h)',
                },
                ...commonNameAttrs(),
            },
        };
    }
    preinitialize() { this.markup = rectPersonMarkup; }
}

export class UnknownPerson extends dia.Element {
    defaults() {
        return {
            ...super.defaults,
            type: 'genogram.UnknownPerson',
            size: { width: symbolWidth, height: symbolHeight },
            z: defaultZIndex.person,
            attrs: {
                body: {
                    points: 'calc(0.5*w),0 calc(w),calc(0.5*h) calc(0.5*w),calc(h) 0,calc(0.5*h)',
                    fill: colors.unknownFill,
                    stroke: colors.unknownStroke,
                    strokeWidth: 2,
                },
                ...commonNameAttrs(),
            },
        };
    }
    preinitialize() { this.markup = diamondPersonMarkup; }
}

// --- Union connector box ---

function qualityColors(quality?: RelationshipQuality | null) {
    switch (quality) {
        case 'green':  return { fill: colors.qualityGreenFill,   stroke: colors.qualityGreenStroke };
        case 'yellow': return { fill: colors.qualityYellowFill,  stroke: colors.qualityYellowStroke };
        case 'red':    return { fill: colors.qualityRedFill,     stroke: colors.qualityRedStroke };
        default:       return { fill: colors.qualityNeutralFill, stroke: colors.qualityNeutralStroke };
    }
}

const unionBoxMarkup = util.svg`
    <rect @selector="body"/>
    <text @selector="label"/>
    <path @selector="endedX"/>
`;

export class UnionBox extends dia.Element {
    defaults() {
        return {
            ...super.defaults,
            type: 'genogram.UnionBox',
            size: { width: sizes.unionBoxWidth, height: sizes.unionBoxHeight },
            z: defaultZIndex.unionBox,
            attrs: {
                body: {
                    width: 'calc(w)',
                    height: 'calc(h)',
                    fill: colors.qualityNeutralFill,
                    stroke: colors.qualityNeutralStroke,
                    strokeWidth: 1.5,
                    rx: 4,
                    ry: 4,
                },
                label: {
                    text: '',
                    textVerticalAnchor: 'middle' as const,
                    textAnchor: 'middle' as const,
                    x: 'calc(0.5*w)',
                    y: 'calc(0.5*h)',
                    fontSize: 9,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fill: colors.dark,
                    fontWeight: 'normal' as const,
                },
                endedX: {
                    d: '',
                    stroke: colors.dark,
                    strokeWidth: 1.5,
                    strokeLinecap: 'round' as const,
                    fill: 'none',
                },
            },
        };
    }
    preinitialize() { this.markup = unionBoxMarkup; }
}

export function styleUnionBox(
    box: UnionBox,
    quality: RelationshipQuality | null | undefined,
    status: UnionStatus | undefined,
) {
    const { fill, stroke } = qualityColors(quality);
    const ended = status === 'separated' || status === 'divorced';
    const w = sizes.unionBoxWidth;
    const h = sizes.unionBoxHeight;
    const p = 5;

    box.attr({
        body: { fill, stroke },
        label: {
            text: ended
                ? (status === 'divorced' ? 'Divorced' : 'Separated')
                : '',
        },
        endedX: {
            d: ended ? `M ${p} ${p} L ${w - p} ${h - p} M ${w - p} ${p} L ${p} ${h - p}` : '',
        },
    });
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
                    strokeWidth: 2,
                    targetMarker: null,
                },
            },
        }, super.defaults);
    }
}
