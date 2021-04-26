import {
    invert, remap, toLut, tryGet, firstKey, inLut, notInLut,
    isEmpty, isString, isNumber, isDict, isArray,
    Dict
} from '../utils';

test("invert test", () => {
    expect(invert({})).toMatchObject({});
    let o1 = { a: "A", b: "B" };
    expect(invert(o1)).toMatchObject({ A: "a", B: "b" });
    let o2 = { 2: "A", 7: "-3" };
    expect(invert(o2)).toMatchObject({ A: "2", "-3": "7" });
});

test("remap test", () => {
    let src = { age: 10, town: "London", tested: false };
    let transl = { age: "Age", town: "City", "Tested": "WasTested" }
    let tgt: Dict<any> = {}
    expect(remap(src, transl, tgt)).toMatchObject({ Age: 10, City: "London" });
    expect(remap(src, transl, tgt)).toEqual(
        expect.objectContaining({ Age: 10, City: "London" })
    );
    tgt = { zip_code: 153 };
    expect(remap(src, transl, tgt)).toMatchObject({ Age: 10, City: "London", zip_code: 153 });
});

test("toLut test", () => {
    let keys = ["age", "size", "weight"];
    expect(toLut(keys, 7)).toMatchObject({ age: 7, size: 7, weight: 7 });

    let vals = [2, 5, 9];
    expect(toLut(keys, vals)).toMatchObject({ age: 2, size: 5, weight: 9 });

    let vals2 = [2, 5];
    expect(toLut(keys, vals2)).toMatchObject({ age: 2, size: 5, weight: undefined });
    expect(Object.keys(toLut(keys, vals2))).toEqual(expect.arrayContaining(keys));
});

test("tryGet test", () => {
    let src = { age: 10, town: "London", tested: false };
    expect(tryGet("tested", src, 121)).toBe(false);
    expect(tryGet("city", src, "Berlin")).toBe("Berlin");
    expect(tryGet("town", src, "Berlin")).toBe("London");
    expect(tryGet("town", null, "Berlin")).toBe("Berlin");
    expect(tryGet("town", undefined, "Berlin")).toBe(undefined);
});

test("firstKey test", () => {
    let src = { age: 10, town: "London", tested: false };
    let keys = Object.keys(src);
    expect(keys).toContain(firstKey(src));
    expect(keys).not.toContain(firstKey({ prop: 1 }));
    expect(firstKey({})).toBe(undefined);
    expect(firstKey(null)).toBe(undefined);
});

test("inLut test", () => {
    let src = { age: 10, town: "London", tested: false };
    let keys = Object.keys(src);
    expect(inLut(keys, src)).toEqual(expect.arrayContaining(keys));
    expect(inLut(["age", "weight"], src)).toEqual(expect.arrayContaining(["age"]));
    expect(inLut({ age: 14, tested: 3 }, src)).toMatchObject({ age: 1, tested: 1 });
    expect(inLut(src, src)).toMatchObject({ age: 1, town: 1, tested: 1 });
});

test("notInLut test", () => {
    let src = { age: 10, town: "London", tested: false };
    let keys = Object.keys(src);
    expect(notInLut(keys, src)).toBeFalsy();
    expect(notInLut(["city", "tested"], src)).toEqual(expect.arrayContaining(["city"]));
    expect(notInLut({city:"A", tested:"B"}, src)).toMatchObject({city:1});
});

test("isEmpty test", () => {
    expect(isEmpty(0)).toBe(true);
    expect(isEmpty("")).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(false)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);

    expect(isEmpty(1)).toBeFalsy();
    expect(isEmpty("abc")).toBeFalsy();
    expect(isEmpty([14])).toBeFalsy();
    expect(isEmpty({a:"A"})).toBeFalsy();
    expect(isEmpty(true)).toBeFalsy();
});

