import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/components/brand/BrandLogo";
import SiteFooter from "@/components/SiteFooter";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { AREA_GROUPS, AREAS, areaOf, inArea } from "@/lib/areaPages";
import { siteUrl } from "@/lib/siteUrl";

// 지역별 소개 페이지(/area/daegu 등) — 2026-11-13
// 검색으로 들어오는 사람에게 그 지역의 반려동물 동반 장소를 분류별로 보여 주고, 지도·장소 상세로 이어 줍니다.
// 하루에 한 번 다시 만듭니다(공공데이터가 새벽에 갱신됨). 정보가 많이 채워진 곳(전화·영업시간·사진)을 앞에 둡니다.

export const revalidate = 86_400;
export const dynamicParams = false;
export function generateStaticParams() {
  return AREAS.map((a) => ({ region: a.id }));
}

type Place = { id: number; name: string; category: string | null; address: string | null; phone: string | null; hours: string | null; image_url: string | null; lat: string | number | null; lng: string | number | null };
const PER_GROUP = 12;
const hasPhoto = (p: Place) => !!p.image_url && !p.image_url.includes("default-place");
const richness = (p: Place) => Number(hasPhoto(p)) * 2 + Number(!!p.hours) + Number(!!p.phone);

async function load(regionId: string) {
  const area = areaOf(regionId);
  if (!area) return null;
  const all = ((await getMergedPublicDataPlaces().catch(() => [])) as Place[]).filter((p) => inArea(p.address, area.id));
  const groups = AREA_GROUPS.map((g) => {
    const rows = all.filter((p) => g.test(p.category ?? ""));
    return { ...g, count: rows.length, top: [...rows].sort((a, b) => richness(b) - richness(a) || a.name.localeCompare(b.name, "ko")).slice(0, PER_GROUP) };
  }).filter((g) => g.count > 0);
  return { area, total: all.length, groups };
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const data = await load((await params).region);
  if (!data) return { title: "지역별 반려동물 동반 장소 | 펫츠로드" };
  const title = `${data.area.label} 반려동물 동반 장소 ${data.total.toLocaleString("ko-KR")}곳 | 펫츠로드`;
  const description = `${data.area.label}에서 반려동물과 함께 갈 수 있는 ${data.groups.map((g) => `${g.title} ${g.count.toLocaleString("ko-KR")}곳`).join(", ")}을 지도에서 찾아보세요.`;
  const url = `${siteUrl}/area/${data.area.id}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "펫츠로드", locale: "ko_KR", type: "website" } };
}

export default async function AreaPage({ params }: { params: Promise<{ region: string }> }) {
  const data = await load((await params).region);
  if (!data) notFound();
  const { area, total, groups } = data;
  return (
    <div className="ggk-body" style={{ minHeight: "100dvh", background: "#FAF9F8", color: "#1F1A16" }}>
      <header style={{ background: "white", borderBottom: "1px solid #EDECEB" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" aria-label="펫츠로드 지도"><BrandLogo height={30} /></Link>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#3B2A20", textDecoration: "none" }}>지도에서 보기</Link>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 120px" }}>
        <h1 className="ggk-logo" style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#3B2A20", lineHeight: 1.35 }}>{area.label} 반려동물 동반 장소</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14.5, color: "#5E5048", lineHeight: 1.7 }}>
          {area.label}에서 반려동물과 함께 갈 수 있는 곳 {total.toLocaleString("ko-KR")}곳을 모았어요.<br />
          공공데이터와 방문자 제보로 확인한 동반 조건·영업시간·전화번호를 볼 수 있어요.
        </p>

        <nav aria-label="다른 지역" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 18 }}>
          {AREAS.map((a) => (
            <Link key={a.id} href={`/area/${a.id}`} aria-current={a.id === area.id ? "page" : undefined} style={{ padding: "7px 13px", borderRadius: 999, border: `1px solid ${a.id === area.id ? "#3B2A20" : "#E7E1DC"}`, background: a.id === area.id ? "#3B2A20" : "white", color: a.id === area.id ? "white" : "#3B2A20", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>{a.label}</Link>
          ))}
        </nav>

        {groups.map((g) => (
          <section key={g.id} style={{ marginTop: 32 }}>
            <h2 className="ggk-logo" style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#3B2A20" }}>
              {area.label} 반려동물 동반 {g.title} <span style={{ fontSize: 14, color: "#A05A32" }}>{g.count.toLocaleString("ko-KR")}곳</span>
            </h2>
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {g.top.map((p) => (
                <li key={p.id}>
                  <Link href={`/place/${p.id}`} style={{ display: "flex", gap: 11, padding: 10, borderRadius: 14, border: "1px solid #E7E1DC", background: "white", textDecoration: "none", color: "#1F1A16", height: "100%", boxSizing: "border-box" }}>
                    <span style={{ width: 64, height: 64, borderRadius: 11, overflow: "hidden", background: "#FCF1E9", flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {hasPhoto(p) && <img src={p.image_url as string} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</b>
                      <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#5E5048", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.category} · {(p.address ?? "").split(" ").slice(1, 3).join(" ")}</span>
                      {p.hours && <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#3B2A20", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.hours.split("\n")[0]}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {g.count > g.top.length && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#5E5048" }}>
                나머지 {(g.count - g.top.length).toLocaleString("ko-KR")}곳은 <Link href="/" style={{ color: "#A05A32", fontWeight: 700 }}>지도</Link>에서 볼 수 있어요.
              </p>
            )}
          </section>
        ))}

        <section style={{ marginTop: 34, padding: "18px 18px", borderRadius: 16, background: "#FCF1E9", border: "1px solid #EBC8B1" }}>
          <h2 className="ggk-logo" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3B2A20" }}>{area.label}에서 반려동물과 하루 보내기</h2>
          <p style={{ margin: "6px 0 12px", fontSize: 13.5, color: "#5E5048", lineHeight: 1.7 }}>
            지도에서 가까운 동반 장소를 찾고, 동반 숙소 예약과 동네 반려 가게 미리 주문까지 한 번에 할 수 있어요.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "10px 16px", borderRadius: 10, background: "#3B2A20", color: "white", fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}>지도 열기</Link>
            <Link href="/stay" style={{ padding: "10px 16px", borderRadius: 10, background: "white", border: "1px solid #3B2A20", color: "#3B2A20", fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}>동반 숙소 보기</Link>
            <Link href="/community" style={{ padding: "10px 16px", borderRadius: 10, background: "white", border: "1px solid #3B2A20", color: "#3B2A20", fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}>{area.label} 반려인 커뮤니티</Link>
          </div>
        </section>
        <p style={{ marginTop: 18, fontSize: 12, color: "#5E5048", lineHeight: 1.7 }}>
          출처: 한국관광공사, 한국문화정보원, 식품의약품안전처, 행정안전부 공공데이터. 방문 전에 가게에 한 번 더 확인해 주세요.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
