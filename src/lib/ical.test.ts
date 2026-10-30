import { describe, expect, it } from "vitest";
import { buildIcal, cleanIcalUrl, parseIcalNights } from "./ical";

const sample = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261107", "SUMMARY:Reserved", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20261110T060000Z", "DTEND:20261111T020000Z", "SUMMARY:Airbnb (Not available)", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261121", "STATUS:CANCELLED", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261201", "SUMMARY:하루", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("달력 가져오기", () => {
  it("숙박하는 밤만 뽑고(체크아웃 날 제외) 취소된 일정은 뺀다", () => {
    expect(parseIcalNights(sample, "2026-11-01", "2027-01-01").map((x) => x.day)).toEqual(["2026-11-05", "2026-11-06", "2026-11-10", "2026-12-01"]);
  });
  it("기간 밖은 뺀다", () => {
    expect(parseIcalNights(sample, "2026-11-06", "2026-11-10").map((x) => x.day)).toEqual(["2026-11-06"]);
  });
  it("접힌 줄을 이어 읽는다", () => {
    const folded = "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:202611\r\n 05\r\nEND:VEVENT";
    expect(parseIcalNights(folded, "2026-11-01", "2026-12-01").map((x) => x.day)).toEqual(["2026-11-05"]);
  });
});

describe("달력 내보내기·주소", () => {
  it("예약과 막은 날을 종일 일정으로", () => {
    const text = buildIcal("스위트", [{ id: 7, check_in: "2026-11-05", check_out: "2026-11-07" }], ["2026-11-20"], new Date("2026-10-29T00:00:00Z"));
    expect(text).toContain("DTSTART;VALUE=DATE:20261105");
    expect(text).toContain("DTEND;VALUE=DATE:20261107");
    expect(text).toContain("DTEND;VALUE=DATE:20261121");
    expect(parseIcalNights(text, "2026-11-01", "2026-12-01").map((x) => x.day)).toEqual(["2026-11-05", "2026-11-06", "2026-11-20"]);
  });
  it("https만, 내부 주소는 막는다", () => {
    expect(cleanIcalUrl("webcal://www.airbnb.co.kr/calendar/ical/1.ics")).toEqual({ url: "https://www.airbnb.co.kr/calendar/ical/1.ics" });
    expect("error" in cleanIcalUrl("http://example.com/a.ics")).toBe(true);
    expect("error" in cleanIcalUrl("https://127.0.0.1/a.ics")).toBe(true);
    expect("error" in cleanIcalUrl("https://localhost/a.ics")).toBe(true);
    expect(cleanIcalUrl("")).toEqual({ url: null });
  });
});
