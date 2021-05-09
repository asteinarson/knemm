import {
    invert, remap, toLut, tryGet, firstKey, inLut, notInLut,
    isEmpty, isString, isNumber, isDict, isArray,
    Dict,
    isDictWithKeys,
    isArrayWithElems,
    append,
    dArrAt,
    objectMap,
    findValueOf
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
    expect(firstKey(["abc"])).toBe('0');
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
    expect(notInLut({ city: "A", tested: "B" }, src)).toMatchObject({ city: 1 });
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
    expect(isEmpty({ a: "A" })).toBeFalsy();
    expect(isEmpty(true)).toBeFalsy();
});

test("isString test", () => {
    expect(isString("")).toBe(true);
    expect(isString("abc")).toBe(true);
    expect(isString([3, 9].join("-"))).toBe(true);
    expect(isString(0)).toBeFalsy();
    expect(isString(null)).toBeFalsy();
    expect(isString({})).toBeFalsy();
    expect(isString(undefined)).toBeFalsy();
    expect(isString([3, 7])).toBeFalsy();
});

test("isNumber test", () => {
    expect(isNumber(11)).toBe(true);
    expect(isNumber(0.0)).toBe(true);
    expect(isNumber([3, 9].length)).toBe(true);
    expect(isNumber(-2.3)).toBe(true);
    expect(isNumber(NaN)).toBe(true);
    expect(isNumber(Number("143.9"))).toBe(true);
    expect(isNumber(null)).toBeFalsy();
    expect(isNumber({})).toBeFalsy();
    expect(isNumber(undefined)).toBeFalsy();
    expect(isNumber([3, 7])).toBeFalsy();
    expect(isNumber("the cat")).toBeFalsy();
});

test("isDict test", () => {
    expect(isDict({})).toBe(true);
    expect(isDict({ a: 13, b: "cat" })).toBe(true);
    // null could be either (?)
    //expect(isDict(null)).toBeFalsy();
    expect(isDict(0)).toBeFalsy();
    expect(isDict("www")).toBeFalsy();
    expect(isDict(NaN)).toBeFalsy();
    expect(isDict(undefined)).toBeFalsy();
    expect(isDict([3, 7])).toBeFalsy();
});

test("isDictWithKeys test", () => {
    expect(isDictWithKeys({ a: 13, b: "cat" })).toBeTruthy();
    expect(isDictWithKeys({ a: undefined })).toBeTruthy();
    expect(isDictWithKeys({})).toBeFalsy();
    expect(isDictWithKeys(null)).toBeFalsy();
    expect(isDictWithKeys(0)).toBeFalsy();
    expect(isDictWithKeys("www")).toBeFalsy();
});

test("isArray test", () => {
    expect(isArray([3, 7])).toBe(true);
    expect(isArray([])).toBe(true);
    // null could be either (?)
    expect(isArray(null)).toBeFalsy();
    expect(isArray(0)).toBeFalsy();
    expect(isArray("www")).toBeFalsy();
    expect(isArray(NaN)).toBeFalsy();
    expect(isArray(undefined)).toBeFalsy();
    expect(isArray({ a: 11 })).toBeFalsy();
    expect(isArray({ "0": 1 })).toBeFalsy();
});

test("isArrayWithElems test", () => {
    expect(isArrayWithElems([3, 7])).toBe(true);
    expect(isArrayWithElems([])).toBeFalsy();
    // null could be either (?)
    expect(isArrayWithElems(null)).toBeFalsy();
    expect(isArrayWithElems(0)).toBeFalsy();
    expect(isArrayWithElems("www")).toBeFalsy();
});

test("append test", () => {
    expect(append({}, { a: 1, c: 13 })).toMatchObject({ a: 1, c: 13 });
    expect(append({ b: 5 }, { a: 1, c: 13 })).toMatchObject({ a: 1, b: 5, c: 13 });

    let o1 = { b: 5 };
    append(o1, { a: 1, c: 13 });
    expect(o1).toMatchObject({ a: 1, b: 5, c: 13 });

    expect(append([], ["a", 17])).toStrictEqual(["a", 17]);
    expect(append(["b"], ["a", 15])).toStrictEqual(["b", "a", 15]);

    let a1 = [3, "c"];
    append(a1, ["d", 17]);
    expect(a1).toMatchObject([3, "c", "d", 17]);
});

test("dArrAtt test", () => {
    let a = ["cat", 2, "pig", "horse", 7];
    expect(dArrAt(a, -1)).toEqual(7);
    expect(dArrAt(a, -121)).toEqual(undefined);
    expect(dArrAt(a, 0)).toEqual("cat");
    expect(dArrAt(a, 19)).toEqual(undefined);
});

test("objectMap test", () => {
    let animals: Dict<number> = { ape: 13, pig: 191, donkey: 12 };
    expect(objectMap(animals, v => v - 1)).toStrictEqual({ ape: 12, pig: 190, donkey: 11 });
    expect(objectMap(animals, v => v.toString().length.toString())).toStrictEqual({ ape: "2", pig: "3", donkey: "2" });
});

test("findValueOf test", () => {
    let o = { a: 14, n1: { c: 13, a: 11 }, arr:[9,{pi_100:314}] };
    expect(findValueOf("a", o)).toBe(14);
    expect(findValueOf("x", o)).toBe(undefined);
    expect(findValueOf("c", o)).toBe(13);
    expect(findValueOf("pi_100", o)).toBe(314);
});
