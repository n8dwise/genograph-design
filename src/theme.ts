export const sizes = {
    symbolWidth: 90,
    symbolHeight: 46,
    deceasedCrossInset: 5,
    coupleGap: 32,
    symbolGap: 28,
    levelGap: 90,
    paperPadding: 60,
    nameMargin: 6,
    nameMaxLineCount: 2,
};

export const linkStyleOverrides = {
    fan: {},
    orthogonal: {
        coupleGap: 44,
        levelGap: 110,
        nameMaxLineCount: 3,
    },
} as const satisfies Record<string, Partial<typeof sizes>>;

export const defaultZIndex = {
    parentChildLink: 1,
    mateLink: 2,
    person: 3,
    focusedOffset: 10,
};

export const colors = {
    // Person gender colors
    maleFill: '#dbeafe',
    maleStroke: '#2563eb',
    femaleFill: '#fce7f3',
    femaleStroke: '#db2777',
    otherFill: '#ede9fe',
    otherStroke: '#7c3aed',
    unknownFill: '#e5e7eb',
    unknownStroke: '#6b7280',

    // Relationship quality (stoplight) — used for mate lines
    qualityGreenStroke: '#16a34a',
    qualityYellowStroke: '#ca8a04',
    qualityRedStroke: '#dc2626',
    qualityNeutralStroke: '#9ca3af',

    // General
    dark: '#111827',
    white: '#ffffff',
    paperBackground: '#f8fafc',
    linkStroke: '#94a3b8',
    highlightStroke: '#e2e8f0',
};

export function qualityStrokeColor(quality?: 'green' | 'yellow' | 'red' | null): string {
    switch (quality) {
        case 'green':  return colors.qualityGreenStroke;
        case 'yellow': return colors.qualityYellowStroke;
        case 'red':    return colors.qualityRedStroke;
        default:       return colors.qualityNeutralStroke;
    }
}
