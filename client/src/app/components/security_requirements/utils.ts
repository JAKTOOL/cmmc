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
