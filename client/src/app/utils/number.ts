export const renderNumber = (i: number | undefined) => {
    const n: number | string = i ?? 0;
    if (n % 1 > 0) {
        return n.toFixed(2);
    }
    return n;
};
