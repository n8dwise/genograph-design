export const sizes = {
    symbolWidth: 50,
    symbolHeight: 50,
    deceasedCrossInset: 5,
    coupleGap: 70,
    unionBoxWidth: 56,
    unionBoxHeight: 26,
    symbolGap: 30,
    levelGap: 100,
    paperPadding: 60,
    nameWrapOverlap: 8,
    nameMargin: 6,
    nameMaxLineCount: 2,
};

export const linkStyleOverrides = {
    fan: {},
    orthogonal: {
        coupleGap: 80,
        levelGap: 120,
        nameMaxLineCount: 4,
    },
} as const satisfies Record<string, Partial<typeof sizes>>;

export const defaultZIndex = {
    parentChildLink: 1,
    mateLink: 2,
    person: 3,
    unionBox: 4,
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

    // Relationship quality (stoplight)
    qualityGreenFill: '#dcfce7',
    qualityGreenStroke: '#16a34a',
    qualityYellowFill: '#fef9c3',
    qualityYellowStroke: '#ca8a04',
    qualityRedFill: '#fee2e2',
    qualityRedStroke: '#dc2626',
    qualityNeutralFill: '#f3f4f6',
    qualityNeutralStroke: '#9ca3af',

    // General
    dark: '#111827',
    white: '#ffffff',
    paperBackground: '#f8fafc',
    linkStroke: '#94a3b8',
    highlightStroke: '#e2e8f0',
};
