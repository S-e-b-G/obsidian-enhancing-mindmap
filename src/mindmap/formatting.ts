export function unprotectGrayStrike(text: string, prefix: string): string {
    if (prefix !== '~~' && prefix !== '~={grey}') return text;
    return text.replace(/~~\.~=\{grey\}/g, '~~~={grey}').replace(/=~\.~~/g, '=~~~');
}

export function protectGrayStrike(text: string, prefix: string): string {
    if (prefix !== '~~') return text;
    return text.replace(/~~~=\{grey\}/g, '~~.~={grey}').replace(/=~~~/g, '=~.~~');
}
