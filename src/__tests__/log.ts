
import { claimsToFile, captureStart, captureStop, fileOf } from './test-utils';


let s_log = "";
const jest_log = jest.spyOn(console, "log").mockImplementation((v) => { s_log += v.toString() + "\n" });
function logGet() {
    let s = s_log;
    s_log = "";
    return s;
}

test("dog test", () => {
    function dogF2() {
        console.log("dog")
        return logGet();
    }
    expect(dogF2()).toBe("dog\n");
    expect((() => {
        console.log("dog")
        return logGet();
    })()).toBe("dog\n");
});
