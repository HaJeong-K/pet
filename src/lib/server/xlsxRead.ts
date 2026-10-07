// src/lib/server/xlsxRead.ts
//
// 엑셀(.xlsx) 파일의 첫 번째 시트를 "행 배열"로 읽는 최소 구현(서버 전용).
// xlsx는 zip으로 묶인 XML이라, zip 목록을 읽어 필요한 두 파일(공유 문자열·첫 시트)만 풀어서 읽습니다.
// 식품안전나라 "반려동물 동반가능 업소현황"처럼 글자만 있는 단순한 표를 읽는 용도라
// 수식·서식·날짜 변환은 다루지 않습니다(라이브러리를 새로 들이지 않으려고 직접 구현).
import { inflateRawSync } from "node:zlib";

/** zip 안의 파일 하나를 꺼냅니다(없으면 null). */
function unzipEntry(zip: Buffer, name: string): Buffer | null {
  // 끝에서부터 "중앙 디렉터리 끝" 표시(PK\x05\x06)를 찾습니다.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const entryName = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      // 실제 데이터는 로컬 헤더(이름·추가 정보 길이가 따로 적혀 있음) 뒤에 있습니다.
      const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      return method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** 셀 안의 글자(<t>…</t> 여러 조각)를 이어 붙입니다. */
const textOf = (xml: string) => decodeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

/** "C12" → 2 (A=0) */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** 첫 시트의 모든 행을 글자 배열로 돌려줍니다(빈 칸은 ""). 읽을 수 없으면 예외. */
export function readXlsxRows(file: Buffer): string[][] {
  const sheetXml = unzipEntry(file, "xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheetXml) throw new Error("엑셀 파일을 읽을 수 없어요(첫 시트 없음).");
  const sharedXml = unzipEntry(file, "xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? textOf(body) : decodeXml(raw);
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}
