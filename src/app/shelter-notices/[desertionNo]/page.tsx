import type { Metadata } from "next";
import { fetchShelterNoticeDetail, officialNoticeUrl } from "@/lib/shelterNotices";
import ShelterNoticeDetailView from "./ShelterNoticeDetailView";

// ── 보호동물 공고 상세 ──
// 공고 카드를 누르면 오는 화면입니다. 공공데이터 Open API로 공고 하나를 조회해서 사진·특징과
// 보호소 연락처를 보여주고, 전화·위치·공고 원문으로 바로 입양/임시보호 문의를 이어갑니다.

type Props = { params: Promise<{ desertionNo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { desertionNo } = await params;
  const n = await fetchShelterNoticeDetail(desertionNo);
  if (!n) return { title: "보호동물 공고 | 같이가개" };
  return {
    title: `${n.breed || n.kind || "보호동물"} · ${n.careName} | 같이가개`,
    description: `${n.noticeNumber} — ${n.careName}에서 새 가족을 기다리고 있어요.`,
  };
}

export default async function ShelterNoticeDetailPage({ params }: Props) {
  const { desertionNo } = await params;
  const notice = await fetchShelterNoticeDetail(desertionNo);
  return (
    <ShelterNoticeDetailView
      notice={notice}
      officialUrl={officialNoticeUrl(desertionNo)}
    />
  );
}
