export interface Person {
    id: number;
    name: string;
    sex: 'M' | 'F' | 'O' | '?';
    age?: number;
    deceased?: boolean;
    isIndexPerson?: boolean;
    notes?: string;
}

export type FamilyRelationType =
    | 'parent' | 'child' | 'sibling' | 'half-sibling' | 'aunt' | 'uncle' | 'niece' | 'nephew';

export const FAMILY_RELATION_LABELS: Record<FamilyRelationType, string> = {
    'parent':       'Parent',
    'child':        'Child',
    'sibling':      'Sibling',
    'half-sibling': 'Half-Sibling',
    'aunt':         'Aunt',
    'uncle':        'Uncle',
    'niece':        'Niece',
    'nephew':       'Nephew',
};

export interface FamilyRelation {
    id: string;
    from: number;
    to: number;
    type: FamilyRelationType;
    quality?: RelationshipQuality;
}

export type BondType =
    | 'guardian' | 'close-friend' | 'counselor'
    | 'mentor' | 'caregiver' | 'sponsor' | 'important-adult' | 'other';

export const BOND_LABELS: Record<BondType, string> = {
    'guardian':       'Guardian',
    'close-friend':   'Close Friend',
    'counselor':      'Counselor',
    'mentor':         'Mentor',
    'caregiver':      'Caregiver',
    'sponsor':        'Sponsor',
    'important-adult':'Important Adult',
    'other':          'Other',
};

export interface Bond {
    id: string;
    from: number;
    to: number;
    type: BondType;
    label?: string;
    quality?: RelationshipQuality;
}

export type UnionType = 'married' | 'cohabiting' | 'affair' | 'unknown';
export type UnionStatus = 'active' | 'separated' | 'divorced';
export type RelationshipQuality = 'green' | 'yellow' | 'red';

export interface Union {
    id: string;
    partners: [number, number];
    type?: UnionType;
    status?: UnionStatus;
    quality?: RelationshipQuality;
    children?: number[];
}

export interface FamilyData {
    meta?: {
        title?: string;
        date?: string;
    };
    persons: Person[];
    unions: Union[];
    familyRelations?: FamilyRelation[];
    bonds?: Bond[];
}

// Internal types used by the layout engine
export interface LayoutPersonNode {
    id: number;
    name: string;
    sex: 'M' | 'F' | '?';
    mother?: number;
    father?: number;
}

export interface LayoutParentChildLink {
    parentId: number;
    childId: number;
    fromFamilyRelation?: boolean;
    unionId?: string;   // set for union-derived links; undefined for family relation links
}

export interface LayoutMateLink {
    from: number;
    to: number;
    unionId: string;
    status?: UnionStatus;
}

/** Convert FamilyData persons to layout-compatible nodes, deriving mother/father from unions. */
export function toLayoutPersonNodes(data: FamilyData): LayoutPersonNode[] {
    return data.persons.map(p => {
        const parentUnion = data.unions.find(u => (u.children ?? []).includes(p.id));
        let mother: number | undefined;
        let father: number | undefined;

        if (parentUnion) {
            const [p0Id, p1Id] = parentUnion.partners;
            const p0 = data.persons.find(x => x.id === p0Id);
            const p1 = data.persons.find(x => x.id === p1Id);
            if (p0?.sex === 'F') {
                mother = p0Id;
                father = p1Id;
            } else {
                father = p0Id;
                mother = p1Id;
            }
        }

        return {
            id: p.id,
            name: p.name,
            sex: (p.sex === 'O' ? '?' : p.sex) as 'M' | 'F' | '?',
            mother,
            father,
        };
    });
}

export function getParentChildLinks(data: FamilyData): LayoutParentChildLink[] {
    const links: LayoutParentChildLink[] = [];
    for (const union of data.unions) {
        for (const childId of (union.children ?? [])) {
            for (const partnerId of union.partners) {
                links.push({ parentId: partnerId, childId, unionId: union.id });
            }
        }
    }
    for (const rel of (data.familyRelations ?? [])) {
        if (rel.type === 'parent') links.push({ parentId: rel.from, childId: rel.to, fromFamilyRelation: true });
        else if (rel.type === 'child') links.push({ parentId: rel.to, childId: rel.from, fromFamilyRelation: true });
    }
    return links;
}

export function getMateLinks(data: FamilyData): LayoutMateLink[] {
    return data.unions.map(u => ({
        from: u.partners[0],
        to: u.partners[1],
        unionId: u.id,
        status: u.status,
    }));
}

export function nextPersonId(data: FamilyData): number {
    return data.persons.length === 0
        ? 1
        : Math.max(...data.persons.map(p => p.id)) + 1;
}

export function nextFamilyRelationId(data: FamilyData): string {
    const nums = (data.familyRelations ?? [])
        .map(r => parseInt(r.id.replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    return `fr${nums.length === 0 ? 1 : Math.max(...nums) + 1}`;
}

export function nextBondId(data: FamilyData): string {
    const nums = (data.bonds ?? [])
        .map(b => parseInt(b.id.replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    return `b${nums.length === 0 ? 1 : Math.max(...nums) + 1}`;
}

export function nextUnionId(data: FamilyData): string {
    const nums = data.unions
        .map(u => parseInt(u.id.replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    return `u${nums.length === 0 ? 1 : Math.max(...nums) + 1}`;
}

export const DEFAULT_FAMILY_DATA: FamilyData = {
    meta: { title: '' },
    persons: [],
    unions: [],
};
