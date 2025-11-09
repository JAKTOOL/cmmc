export function debounce(func, delay) {
    let timeoutId: NodeJS.Timeout | undefined;
    return function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export const toBuffer = (file: File | Blob) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as ArrayBuffer);
        fr.onerror = (err) => reject(err);
        fr.readAsArrayBuffer(file);
    });

export const toDataURL = (file: File | Blob) =>
    new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = (err) => reject(err);
        fr.readAsDataURL(file);
    });
