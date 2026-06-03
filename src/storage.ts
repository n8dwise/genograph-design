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
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = () => {
            document.body.removeChild(input);
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
        };
        input.click();
    });
}

export async function exportPng(paper: dia.Paper, filename = 'genograph') {
    const padding = 40;
    const bbox = paper.getContentBBox({ useModelGeometry: true });

    // Clone the SVG and crop it to the content area with padding
    const clone = paper.svg.cloneNode(true) as SVGSVGElement;
    const vbX = bbox.x - padding;
    const vbY = bbox.y - padding;
    const vbW = bbox.width + padding * 2;
    const vbH = bbox.height + padding * 2;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(vbW));
    clone.setAttribute('height', String(vbH));
    clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.style.cssText = '';

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = 2; // retina quality
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(vbW * scale);
            canvas.height = Math.ceil(vbH * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.scale(scale, scale);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, vbW, vbH);
            ctx.drawImage(img, 0, 0, vbW, vbH);
            URL.revokeObjectURL(svgUrl);
            canvas.toBlob(pngBlob => {
                if (!pngBlob) { resolve(); return; }
                const pngUrl = URL.createObjectURL(pngBlob);
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = `${filename}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
                resolve();
            }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(); };
        img.src = svgUrl;
    });
}
