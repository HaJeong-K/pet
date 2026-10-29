import { describe, expect, it } from "vitest";
import { cleanLodgingProfile, cleanRoom, cleanTime, petPolicySummary, roomPriceText } from "./lodgingRules";

describe("cleanTime", () => {
  it("시각을 두 자리로 맞춘다", () => {
    expect(cleanTime("9:00")).toBe("09:00");
    expect(cleanTime("15:30")).toBe("15:30");
    expect(cleanTime("")).toBeNull();
    expect(cleanTime("25:00")).toBe("bad");
    expect(cleanTime("오후 3시")).toBe("bad");
  });
});

describe("cleanLodgingProfile", () => {
  it("크기·종류별 반려동물 요금과 부가 옵션", () => {
    const r = cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: ["small", "large"], pet_fee: 10000, pet_fees: { large: "20000", cat: "" },
      extras: [{ name: " 바비큐 ", price: "30000", unit: "stay", max: "2" }, { name: "", price: "" }] });
    expect("profile" in r && r.profile.pet_fees).toEqual({ large: 20000 });
    expect("profile" in r && r.profile.extras.map((x) => [x.name, x.price, x.unit, x.max])).toEqual([["바비큐", 30000, "stay", 2]]);
    expect("profile" in r && petPolicySummary(r.profile)).toContain("대형견 20,000원");
    expect("error" in cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: ["small"], extras: [{ name: "바비큐", price: "-1" }] })).toBe(true);
  });
  it("요일별 객실 요금", () => {
    const r = cleanRoom({ name: "스위트", base_price: 100000, std_guests: 2, max_guests: 2, weekday_prices: ["", "80000", "", "", "", "150000", ""] });
    expect("room" in r && r.room.weekday_prices).toEqual([null, 80000, null, null, null, 150000, null]);
    expect("room" in r && roomPriceText(r.room)).toBe("1박 80,000원부터 · 요일별 요금");
    const plain = cleanRoom({ name: "스탠다드", base_price: 100000, std_guests: 2, max_guests: 2 });
    expect("room" in plain && plain.room.weekday_prices).toBeNull();
  });
  it("그 외 동물은 어떤 동물인지 적어야 함", () => {
    expect("error" in cleanLodgingProfile({ pet_species: ["other"] })).toBe(true);
    const r = cleanLodgingProfile({ pet_species: ["cat", "other"], pet_others: " 토끼·햄스터 " });
    expect("profile" in r && r.profile.pet_others).toBe("토끼·햄스터");
    expect("profile" in r && petPolicySummary({ ...r.profile })).toContain("토끼·햄스터");
  });
  it("기본 동반 규정을 다듬는다", () => {
    const r = cleanLodgingProfile({
      check_in: "15:00", check_out: "11:00", pet_species: ["dog", "rabbit"], pet_sizes: ["small", "medium"],
      max_pet_weight_kg: "10", max_pets: 2, pet_fee: 10000, pet_amenities: ["펫 샤워장", "없는 항목"], pet_rules: "  침대 위 금지  ",
    });
    expect("profile" in r).toBe(true);
    if (!("profile" in r)) return;
    expect(r.profile.pet_species).toEqual(["dog"]);
    expect(r.profile.pet_sizes).toEqual(["small", "medium"]);
    expect(r.profile.max_pet_weight_kg).toBe(10);
    expect(r.profile.pet_amenities).toEqual(["펫 샤워장"]);
    expect(r.profile.pet_rules).toBe("침대 위 금지");
  });
  it("동물을 하나도 안 고르면 막는다", () => {
    expect(cleanLodgingProfile({ pet_species: [] })).toEqual({ error: expect.any(String) });
  });
  it("강아지를 받으면 크기를 하나 이상 골라야 한다", () => {
    expect(cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: [] })).toEqual({ error: expect.any(String) });
  });
  it("고양이만 받으면 강아지 크기는 비운다", () => {
    const r = cleanLodgingProfile({ pet_species: ["cat"], pet_sizes: ["large"] });
    expect("profile" in r && r.profile.pet_sizes).toEqual([]);
  });
  it("잘못된 시각·숫자는 막는다", () => {
    expect("error" in cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: ["small"], check_in: "3시" })).toBe(true);
    expect("error" in cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: ["small"], max_pets: 0 })).toBe(true);
    expect("error" in cleanLodgingProfile({ pet_species: ["dog"], pet_sizes: ["small"], pet_fee: -1 })).toBe(true);
  });
});

describe("cleanRoom", () => {
  const ok = { name: "  오션  독채 ", base_price: 120000, std_guests: 2, max_guests: 4, extra_guest_fee: 20000 };
  it("객실을 다듬는다", () => {
    const r = cleanRoom({ ...ok, amenities: ["독채", "모르는 것"], images: ["https://x.supabase.co/a.jpg", "javascript:alert(1)"] });
    expect("room" in r).toBe(true);
    if (!("room" in r)) return;
    expect(r.room.name).toBe("오션 독채");
    expect(r.room.amenities).toEqual(["독채"]);
    expect(r.room.images).toEqual(["https://x.supabase.co/a.jpg"]);
    expect(r.room.extra_guest_fee).toBe(20000);
  });
  it("기준 인원 = 최대 인원이면 인원 추가 요금은 없앤다", () => {
    const r = cleanRoom({ ...ok, max_guests: 2 });
    expect("room" in r && r.room.extra_guest_fee).toBeNull();
  });
  it("필수값·인원 순서를 확인한다", () => {
    expect("error" in cleanRoom({ ...ok, name: "" })).toBe(true);
    expect("error" in cleanRoom({ ...ok, base_price: "" })).toBe(true);
    expect("error" in cleanRoom({ ...ok, std_guests: 4, max_guests: 2 })).toBe(true);
    expect("error" in cleanRoom({ ...ok, images: Array(7).fill("https://x.co/a.jpg") })).toBe(true);
  });
});

describe("손님용 요약", () => {
  it("동반 조건을 한 줄로", () => {
    expect(petPolicySummary({ pet_species: ["dog", "cat"], pet_sizes: ["small", "medium"], max_pet_weight_kg: 10, max_pets: 2, pet_fee: 10000 }))
      .toBe("강아지(소형견·중형견, 10kg 이하)·고양이 · 최대 2마리 · 1마리 1박 10,000원");
    expect(petPolicySummary({ pet_species: ["dog"], pet_sizes: ["small", "medium", "large"], max_pet_weight_kg: null, max_pets: null, pet_fee: 0 }))
      .toBe("강아지(크기 무관) · 추가 요금 없음");
  });
  it("1박 요금 문구", () => {
    expect(roomPriceText({ base_price: 120000, weekend_price: null })).toBe("1박 120,000원");
    expect(roomPriceText({ base_price: 120000, weekend_price: 150000 })).toBe("1박 120,000원 · 주말 150,000원");
  });
});
