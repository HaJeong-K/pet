// scripts/check-db.cjs — scripts/sql의 SQL 파일들이 실제 DB에 반영됐는지 점검합니다.
//   실행: node scripts/check-db.cjs   (.env.local의 Supabase 주소·서버 키를 읽습니다. 키는 출력하지 않습니다.)
//   · 각 SQL 파일에 적힌 표·컬럼·함수가 DB에 있는지 확인
//   · 주요 기능(글 자동 검토, 욕설 필터, 제보 저장, 저장한 코스 권한)을 실제로 불러 확인 — 시험으로 만든 행은 바로 삭제
process.loadEnvFile(require("path").join(__dirname, "..", ".env.local"));
const fs = require("fs");
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sh = { apikey: SVC, authorization: "Bearer " + SVC, "content-type": "application/json" };
const ah = { apikey: ANON, authorization: "Bearer " + ANON, "content-type": "application/json", prefer: "return=representation" };
const ok = (b) => (b ? "✅" : "❌");
(async () => {
  const spec = await (await fetch(SB + "/rest/v1/", { headers: sh })).json();
  const tables = spec.definitions || {};
  const rpcs = Object.keys(spec.paths || {}).filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5));

  // 1) SQL 파일에 적힌 표·컬럼·함수가 DB에 있는지
  console.log("── 1) 표·컬럼·함수 ──");
  const missing = [];
  for (const file of fs.readdirSync(require("path").join(__dirname, "sql")).filter((f) => f.endsWith(".sql") && !/^(reset-|cleanup-|remove-)/.test(f))) {
    const sql = fs.readFileSync(require("path").join(__dirname, "sql", file), "utf8").replace(/--.*$/gm, "");
    const items = [];
    for (const m of sql.matchAll(/create table if not exists (?:public\.)?([a-z_]+)/g)) items.push(["표", m[1], !!tables[m[1]]]);
    for (const m of sql.matchAll(/alter table (?:public\.)?([a-z_]+)\s+add column if not exists ([a-z_]+)/g)) items.push(["컬럼", `${m[1]}.${m[2]}`, !!tables[m[1]]?.properties?.[m[2]]]);
    for (const m of sql.matchAll(/create or replace function (?:public\.)?([a-z_]+)\s*\(([^)]*)\)\s*returns\s+(\w+)/g)) if (m[3] !== "trigger") items.push(["함수", m[1], rpcs.includes(m[1])]);
    const bad = items.filter((i) => !i[2]);
    console.log(`${ok(bad.length === 0)} ${file.padEnd(40)} ${items.length}개 항목${bad.length ? " — 빠짐: " + bad.map((i) => i[0] + " " + i[1]).join(", ") : ""}`);
    missing.push(...bad.map((b) => file + ": " + b[1]));
  }

  // 2) 트리거는 목록을 볼 수 없어서 실제 동작으로 확인(시험 글은 바로 삭제)
  console.log("\n── 2) 동작 시험(일반 사용자 권한으로 저장 → 결과 확인 → 삭제) ──");
  const del = (table, id) => fetch(`${SB}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: sh });
  // 2-1) 글 자동 검토 — 글쓰기는 로그인한 사람만 할 수 있어(비회원 저장은 DB가 거절) 실제 글을 써 보는 대신,
  //      트리거가 쓰는 판정 함수를 직접 불러 규칙이 살아 있는지 확인합니다.
  for (const [board, text, expectHold] of [["share", "사료 2만원에 팝니다", true], ["share", "안 쓰는 하네스 무료로 나눔해요", false], ["rescue", "책임비 30만원", true], ["rescue", "보신 분 010-2222-3333 연락 주세요", false], ["free", "예약 문의 주세요 010-1234-5678", true], ["business", "오픈 이벤트 20% 할인", false]]) {
    const r = await fetch(SB + "/rest/v1/rpc/review_reason_for", { method: "POST", headers: sh, body: JSON.stringify({ p_board: board, p_text: text }) });
    const reason = r.ok ? await r.json() : "(함수 없음 " + r.status + ")";
    console.log(`${ok(r.ok && (reason != null) === expectHold)} 글 자동 검토 [${board}] "${text}" → ${reason ?? "바로 게시"}`);
  }
  // 2-2) 사장님 답글 배지 컬럼
  const io = await fetch(SB + "/rest/v1/review_replies?select=is_owner&limit=1", { headers: sh });
  console.log(`${ok(io.ok)} 사장님 답글 배지 컬럼(review_replies.is_owner): ${io.ok ? "있음" : "없음 — owner-replies.sql이 적용되지 않았어요"}`);
  // 2-2b) 제보하기 화면이 보내는 컬럼 그대로 저장되는지(저장되면 바로 삭제)
  const pr = await fetch(SB + "/rest/v1/proposals", { method: "POST", headers: { ...sh, prefer: "return=representation" }, body: JSON.stringify([{ place_name: "[점검용] 자동 삭제", address: "점검", image_urls: [], reporter_key: "audit", is_resolved: false, status: "pending", is_owner_request: false, ai_verified: false, ai_review: null }]) });
  const pj = await pr.json();
  console.log(`${ok(Array.isArray(pj))} 제보하기 저장: ${Array.isArray(pj) ? "정상" : "실패 — " + (pj.message || "").slice(0, 80)}`);
  if (Array.isArray(pj)) await del("proposals", pj[0].id);
  // 2-3) 저장한 코스: 비회원은 저장·조회 불가
  const c1 = await fetch(SB + "/rest/v1/saved_courses", { method: "POST", headers: ah, body: JSON.stringify([{ title: "점검", stops: [] }]) });
  const c2 = await (await fetch(SB + "/rest/v1/saved_courses?select=id", { headers: ah })).json();
  console.log(`${ok(c1.status >= 400 && Array.isArray(c2) && c2.length === 0)} 저장한 코스: 비회원 저장 ${c1.status >= 400 ? "거절" : "허용됨(문제)"}(${c1.status}), 비회원 조회 ${Array.isArray(c2) ? c2.length + "건" : "오류"}`);
  // 2-4) 욕설 필터(기존)
  const f = await fetch(SB + "/rest/v1/community_posts", { method: "POST", headers: ah, body: JSON.stringify([{ board_id: "free", title: "[점검용]", content: "씨1발 별로", nickname: "점검" }]) });
  const fj = await f.json();
  console.log(`${ok(!Array.isArray(fj))} 욕설 필터(기존): ${Array.isArray(fj) ? "저장됨(문제)" : "저장 거절 — " + (fj.message || "").slice(0, 40)}`);
  if (Array.isArray(fj)) await del("community_posts", fj[0].id);
  // 2-5) 규칙 표·비공개 여부
  const rules = await (await fetch(SB + "/rest/v1/moderation_rules?select=id,board_id,reason,except_boards,enabled", { headers: sh })).json();
  const anonRules = await (await fetch(SB + "/rest/v1/moderation_rules?select=id", { headers: ah })).json();
  console.log(`${ok(Array.isArray(rules) && rules.length >= 11)} 검토 규칙 ${Array.isArray(rules) ? rules.length : "?"}개 | ${ok(Array.isArray(anonRules) && anonRules.length === 0)} 일반 사용자에게는 규칙이 보이지 않음`);
  const phone = Array.isArray(rules) && rules.find((r) => r.reason.startsWith("전화번호"));
  console.log(`${ok(phone && phone.except_boards.includes("rescue"))} 전화번호 규칙에서 유기동물 게시판 제외: ${phone ? JSON.stringify(phone.except_boards) : "규칙 없음"}`);
  // 남은 점검용 글이 없는지
  const left = await (await fetch(SB + "/rest/v1/community_posts?select=id&title=like.*점검용*", { headers: sh })).json();
  console.log(`\n점검용 글 정리: ${Array.isArray(left) && left.length === 0 ? "모두 삭제됨" : "남음 " + JSON.stringify(left)}`);
  console.log(missing.length ? "\n빠진 항목: " + missing.join(" / ") : "\n표·컬럼·함수는 빠진 것 없음");
})();
