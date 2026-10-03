// src/lib/closeModal.ts
//
// 팝업(모달) 화면의 닫기 동작. 로그인·회원가입·제보 화면은 보통 다른 화면 위에 팝업으로 뜨고,
// 닫으면 이전 화면으로 돌아갑니다(router.back). 그런데 주소를 직접 열었거나 새 탭으로 들어온 경우에는
// 돌아갈 이전 화면이 없어서, 닫기를 눌러도 아무 일도 일어나지 않았습니다. 그때는 홈으로 보냅니다.
type RouterLike = { back: () => void; push: (href: string) => void };

export function closeModal(router: RouterLike, fallback = "/"): void {
  if (typeof window !== "undefined" && window.history.length > 1) router.back();
  else router.push(fallback);
}
