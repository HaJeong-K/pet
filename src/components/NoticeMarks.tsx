// src/components/NoticeMarks.tsx
//
// 공지에 함께 쓰는 표시 두 가지 — 커뮤니티 운영진 공지와 사장님 공지(장소·숙소)가 같은 모양으로 보이게 합니다.
//   · NoticeTag : "공지"
//   · RoleMark  : 작성자 옆 "운영진" / "사장님" (공지에는 회원 레벨 대신 이 표시)

export function NoticeTag() {
  return <span style={{ flexShrink: 0, display: "inline-block", padding: "3px 9px", borderRadius: 7, background: "#2F3B28", color: "white", fontSize: 11.5, fontWeight: 800, lineHeight: 1.35 }}>공지</span>;
}

export function RoleMark({ label }: { label: "운영진" | "사장님" }) {
  return <span style={{ flexShrink: 0, display: "inline-block", padding: "2px 7px", borderRadius: 7, background: "#EAF0E3", color: "#2F3B28", fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>{label}</span>;
}
