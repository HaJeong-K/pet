import { describe, expect, it } from "vitest";
import { cleanPetRequirements, missingPetAcks, petRequirementItems } from "./petRequirements";

describe("숙소 입실 조건", () => {
  it("꺼진 항목과 알 수 없는 값은 저장하지 않는다", () => {
    expect(cleanPetRequirements({ registration: true, neutered: false, hack: true, vaccines: ["rabies", "x"], vaccine_years: "2", min_age_months: "" })).toEqual({
      requirements: { registration: true, vaccines: ["rabies"], vaccine_years: 2 },
    });
  });
  it("접종을 고르지 않으면 인정 기간도 버린다", () => {
    expect(cleanPetRequirements({ vaccine_years: 2 })).toEqual({ requirements: {} });
  });
  it.each([{ min_age_months: 0 }, { min_age_months: 1.5 }, { max_height_cm: 500 }, { vaccine_years: 9 }])("잘못된 숫자 %o 는 거절한다", (raw) => {
    expect("error" in cleanPetRequirements(raw)).toBe(true);
  });
  it("고른 항목만 손님 문구로 만든다", () => {
    const items = petRequirementItems({ vaccines: ["rabies", "combo"], vaccine_years: 1, min_age_months: 5, no_unattended: true });
    expect(items.map((i) => i.id)).toEqual(["vaccines", "min_age_months", "no_unattended"]);
    expect(items[0].text).toContain("1년 안에 받은 광견병·종합백신");
    expect(petRequirementItems({})).toEqual([]);
    expect(petRequirementItems(null)).toEqual([]);
  });
  it("확인하지 않은 항목을 찾아낸다", () => {
    const r = { registration: true, leash: true };
    expect(missingPetAcks(r, ["registration"])).toEqual(["leash"]);
    expect(missingPetAcks(r, ["registration", "leash"])).toEqual([]);
    expect(missingPetAcks(r, "registration")).toEqual(["registration", "leash"]);
    expect(missingPetAcks({}, undefined)).toEqual([]);
  });
});
