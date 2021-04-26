
function add(a: number, b: number) {
    return a + b;
}

test("add test", () => {
    expect(add(2, 3)).toBe(5);
    expect(add(7, 11)).toBe(18);
});
