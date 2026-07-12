const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function getPlaces() {
  const res = await fetch(`${API_URL}/places`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("장소 조회 실패");
  }

  return res.json();
}