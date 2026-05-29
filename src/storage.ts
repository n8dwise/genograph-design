import type { dia } from '@joint/core';
import type { FamilyData } from './data';

export function saveFile(data: FamilyData) {
    const title = data.meta?.title ?? 'family';
    const filename = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'family';
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function loadFile(): Promise<FamilyData> {
    return new Promise((resolve, reject) => {
        const input = document.getElementById('file-input') as HTMLInputElement;
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return reject(new Error('No file selected'));
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result as string) as FamilyData;
                    resolve(data);
                } catch {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.readAsText(file);
            input.value = '';
        };
        input.click();
    });
}

export function exportPng(paper: dia.Paper, filename = 'genograph') {
    paper.toDataURL(
        (dataURL: string) => {
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = `${filename}.png`;
            a.click();
        },
        { padding: 40, useComputedStyles: true },
    );
}
