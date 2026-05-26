"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImagePlus, X } from "lucide-react";

import { supabase } from "@/lib/supabase";

const BOARDS = [
  { id: "all", label: "게시판 선택" },
  { id: "free", label: "자유게시판" },

  { id: "seoul", label: "서울" },
  { id: "gyeonggi", label: "경기" },
  { id: "incheon", label: "인천" },
  { id: "gangwon", label: "강원" },
  { id: "chungbuk", label: "충북" },
  { id: "daejeon", label: "대전" },
  { id: "chungnam", label: "충남" },
  { id: "gyeongbuk", label: "경북" },
  { id: "daegu", label: "대구" },
  { id: "ulsan", label: "울산" },
  { id: "gyeongnam", label: "경남" },
  { id: "busan", label: "부산" },
  { id: "gwangju", label: "광주" },
  { id: "jeju", label: "제주" },
];

export default function CommunityWritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialBoard = searchParams.get("board") || "free";

  const [boardId, setBoardId] = useState(initialBoard);

  const [postType, setPostType] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const ADMIN_EMAIL = "infoker12@naver.com";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─────────────────────────────
  // 비회원 차단
  // ─────────────────────────────
  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login?redirect=/community/write");
      }
    };

    check();
  }, []);

  // ─────────────────────────────
  // 이미지 선택
  // ─────────────────────────────
  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    console.log(
      "선택된 파일:",
      files
    );

    if (!files.length) return;

    const nextImages = [...images, ...files].slice(0, 5);

    setImages(nextImages);

    const urls = nextImages.map((file) =>
      URL.createObjectURL(file)
    );

    setPreviewUrls(urls);
  };

  // ─────────────────────────────
  // 이미지 삭제
  // ─────────────────────────────
  const removeImage = (index: number) => {
    const nextImages = [...images];
    const nextPreviews = [...previewUrls];

    nextImages.splice(index, 1);
    nextPreviews.splice(index, 1);

    setImages(nextImages);
    setPreviewUrls(nextPreviews);
  };

  // ─────────────────────────────
  // 글 등록
  // ─────────────────────────────
  const handleSubmit = async () => {
    console.log("handleSubmit 실행");
    if (loading) return;

    if (boardId === "all") {
      alert("게시판을 선택해주세요.");
      return;
    }

    if (!title.trim()) {
      alert("제목을 입력해주세요.");
      return;
    }

    if (!content.trim()) {
      alert("내용을 입력해주세요.");
      return;
    }

    setLoading(true);
    console.log("loading true 완료");

    try {
      console.log("try 진입");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }
      
      const user = session.user;
      console.log("session:", session);

      // ── 이미지 업로드 ──
      const imageUrls: string[] = [];
      console.log("images:", images);

      for (const file of images) {
        try {
          const ext =
            file.name.split(".").pop();

          const fileName =
            `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2)}.${ext}`;

          console.log("업로드 시작:", file.name);

          const {
            data: uploadData,
            error: uploadError,
          } = await supabase.storage
            .from("community-images")
            .upload(fileName, file, {
              cacheControl: "3600",
              upsert: true,
            });

          console.log(
            "업로드 결과:",
            uploadData
          );

          console.log(
            "업로드 에러:",
            uploadError
          );

          if (uploadError) {
            console.error(
              "이미지 업로드 실패:",
              uploadError
            );

            alert(
              uploadError.message ||
              "이미지 업로드 실패"
            );

            setLoading(false);

            return;
          }

          const { data } = supabase.storage
            .from("community-images")
            .getPublicUrl(fileName);

          console.log(
            "publicUrl:",
            data.publicUrl
          );

          imageUrls.push(data.publicUrl);

        } catch (err) {
          console.error(
            "이미지 업로드 오류:",
            err
          );
        }
      }
      console.log(
        "최종 imageUrls:",
        imageUrls
      );

      // ── 게시글 저장 ──
      const {
        data: insertData,
        error: insertError,
      } = await supabase
        .from("community_posts")
        .insert([
          {
            board_id: boardId,

            author_auth_key: user.id,

            post_type: postType || null,

            title: title.trim(),

            content: content.trim(),

            image_urls: imageUrls,

            nickname:
              user.user_metadata?.nickname ||
              "익명",

            avatar_url:
              user.user_metadata?.avatar_url ||
              null,
          },
        ])
        .select()
        .single();

      console.log(
        "insert data:",
        insertData
      );

      console.log(
        "insert error:",
        insertError
      );

      if (insertError) {
        alert(
          insertError.message ||
            "게시글 등록 실패"
        );

        return;
      }

      console.log("게시글 저장 완료");

      alert("등록 완료!");

      setLoading(false);

      setTimeout(() => {
        router.replace("/community");
      }, 150);
    } catch (err) {
      console.error(err);
      setLoading(false);
      alert("오류가 발생했습니다.");
    } finally {
    }
  };

  return (
    <>
      <div
        style={{
          height: "100vh",
          background: "#f5f6f8",

          overflow: "hidden",

          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 상단바 */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,

            height: "56px",

            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(12px)",

            borderBottom: "1px solid #eee",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            padding: "0 14px",

            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "640px",

              display: "flex",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => router.back()}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                marginRight: "8px",
              }}
            >
              <ArrowLeft size={20} />
            </button>

            <div
              className="ggk-logo"
              style={{
                fontSize: "16px",
                fontWeight: 800,
              }}
            >
              글쓰기
            </div>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div
          style={{
            flex: 1,

            overflowY: "auto",

            display: "flex",
            justifyContent: "center",

            padding: "14px",

            // ⭐ 핵심 수정
            paddingBottom: "220px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "640px",
            }}
          >
            <div
              style={{
                background: "white",

                borderRadius: "18px",

                border: "1px solid #e8eaed",

                padding: "16px",

                // ⭐ 핵심 수정
                marginBottom: "170px",
              }}
            >
              {/* 게시판 */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    marginBottom: 6,
                  }}
                >
                  게시판
                </div>

                <select
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    borderRadius: 10,
                    border: "1px solid #e2e4e8",
                    fontSize: 13,
                    background: "#f8fafc",
                  }}
                >
                  {BOARDS.map((board) => (
                    <option
                      key={board.id}
                      value={board.id}
                    >
                      {board.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 말머리 */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    marginBottom: 6,
                  }}
                >
                  말머리
                </div>

                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    borderRadius: 10,
                    border: "1px solid #e2e4e8",
                    fontSize: 13,
                    background: "#f8fafc",
                    color: "#111",
                  }}
                >
                  <option value="">말머리 없음</option>
                  <option value="방문후기">방문후기</option>
                  <option value="질문">질문</option>
                  <option value="정보공유">정보공유</option>
                  <option value="산책친구">산책친구</option>
                </select>
              </div>

              {/* 제목 */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    marginBottom: 6,
                  }}
                >
                  제목
                </div>

                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목을 입력해주세요"
                  style={{
                    width: "100%",
                    height: "44px",

                    borderRadius: "10px",
                    border: "1px solid #e2e4e8",

                    padding: "0 13px",

                    fontSize: "13px",

                    background: "#f8fafc",
                  }}
                />
              </div>

              {/* 내용 */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    marginBottom: 6,
                  }}
                >
                  내용
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="내용을 입력해주세요"
                  style={{
                    width: "100%",

                    height: "140px",
                    minHeight: "140px",
                    maxHeight: "140px",

                    resize: "none",

                    overflowY: "auto",
                    scrollbarWidth: "thin",
                    borderRadius: "14px",
                    border: "1px solid #e2e4e8",

                    padding: "14px",

                    fontSize: "13px",
                    lineHeight: 1.7,

                    background: "#f8fafc",
                  }}
                />
              </div>

              {/* 이미지 업로드 */}
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    marginBottom: 8,
                  }}
                >
                  이미지
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleImageChange}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: "100%",
                    height: "46px",

                    borderRadius: "12px",
                    border: "1px dashed #cfd4dc",

                    background: "#fafbfc",

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",

                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#666",

                    cursor: "pointer",
                  }}
                >
                  <ImagePlus size={16} />
                  이미지 추가 ({images.length}/5)
                </button>
              </div>

              {/* 이미지 미리보기 */}
              {previewUrls.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    overflowX: "auto",
                    paddingBottom: "4px",
                    marginBottom: "16px",
                  }}
                >
                  {previewUrls.map((url, index) => (
                    <div
                      key={index}
                      style={{
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={url}
                        alt="preview"
                        style={{
                          width: "88px",
                          height: "88px",
                          objectFit: "cover",
                          borderRadius: "12px",
                          border: "1px solid #eee",
                        }}
                      />

                      <button
                        onClick={() => removeImage(index)}
                        style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-6px",

                          width: "22px",
                          height: "22px",

                          borderRadius: "50%",
                          border: "none",

                          background: "#111",
                          color: "white",

                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",

                          cursor: "pointer",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              

              {/* 등록 버튼 */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: "100%",
                  height: "50px",

                  marginTop: "18px",

                  borderRadius: "14px",
                  border: "none",

                  background:
                    "linear-gradient(145deg, #2a2a2a, #111)",

                  color: "white",

                  fontSize: "14px",
                  fontWeight: 800,

                  cursor: "pointer",

                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "등록 중..." : "글 등록하기"}
              </button>
              {/* footer */}
              <div
                style={{
                  marginTop: "28px",

                  paddingTop: "22px",
                  paddingBottom: "90px",

                  borderTop: "1px solid #f0f2f5",

                  textAlign: "center",
                }}
              >
                <div
                  className="ggk-logo"
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,

                    color: "#888",

                    marginBottom: "6px",
                  }}
                >
                  같이가개 커뮤니티
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "#aaa",

                    lineHeight: 1.7,

                    marginBottom: "14px",
                  }}
                >
                  행복하고 안전한 반려동물 문화를 위해
                  함께 노력해주세요.
                </div>

                <button
                  onClick={() => setShowPrivacy(true)}
                  style={{
                    border: "none",
                    background: "none",

                    fontSize: "11px",
                    color: "#999",

                    cursor: "pointer",
                  }}
                >
                  개인정보 처리방침
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════
                개인정보 처리방침 모달
            ══════════════════════════════════════ */}
            {showPrivacy && (
              <>
                <div onClick={() => setShowPrivacy(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, backdropFilter:"blur(4px)" }} />
                <div className="ggk-body" style={{
                  position:"fixed", top:"50%", left:"50%",
                  transform:"translate(-50%, -50%)",
                  width:"min(480px, 94vw)", maxHeight:"82vh", overflowY:"auto",
                  background:"white", borderRadius:"20px", zIndex:301,
                  boxShadow:"0 24px 80px rgba(0,0,0,0.22)",
                }}>
                  {/* 모달 헤더 */}
                  <div style={{ position:"sticky", top:0, background:"white", padding:"16px 18px 12px", borderBottom:"1px solid #f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:1 }}>
                    <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111" }}>개인정보 처리방침</div>
                    <button onClick={() => setShowPrivacy(false)} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <X size={14} color="#666" />
                    </button>
                  </div>
      
                  {/* 본문 */}
                  <div style={{ padding:"16px 18px 24px", fontSize:12, color:"#444", lineHeight:1.8 }}>
                    <p style={{ fontSize:11, color:"#999", marginBottom:16 }}>최종 수정일: 2025년 1월 1일</p>
      
                    <Section title="1. 개인정보의 수집 및 이용 목적">
                      같이가개(이하 "서비스")는 다음의 목적으로 개인정보를 수집·이용합니다.<br/>
                      • 회원 가입 및 관리: 회원 식별, 서비스 이용 관리<br/>
                      • 서비스 제공: 장소 정보 제공, 댓글·찜 기능 운영<br/>
                      • 고객 지원: 문의 응대 및 민원 처리
                    </Section>
      
                    <Section title="2. 수집하는 개인정보 항목">
                      • <strong>필수 항목:</strong> 이메일 주소, 닉네임, 비밀번호(암호화 저장)<br/>
                      • <strong>소셜 로그인 시:</strong> 소셜 계정 고유 식별자, 프로필 사진(선택)<br/>
                      • <strong>서비스 이용 시 자동 수집:</strong> 서비스 이용 기록, 접속 로그
                    </Section>
      
                    <Section title="3. 개인정보의 보유 및 이용 기간">
                      • 회원 탈퇴 시 즉시 삭제(단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관)<br/>
                      • 전자상거래 기록: 5년 보관 (전자상거래 등에서의 소비자보호에 관한 법률)<br/>
                      • 서비스 이용 관련 분쟁 시 분쟁 해결 시까지 보관
                    </Section>
      
                    <Section title="4. 개인정보의 제3자 제공">
                      서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.<br/>
                      • 이용자가 사전에 동의한 경우<br/>
                      • 법령의 규정에 의거하거나 수사 목적으로 관련 기관의 요구가 있는 경우
                    </Section>
      
                    <Section title="5. 개인정보 처리 위탁">
                      서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.<br/>
                      • <strong>Supabase Inc.:</strong> 데이터베이스 및 인증 서비스<br/>
                      • <strong>Vercel Inc.:</strong> 서버 호스팅 및 배포
                    </Section>
      
                    <Section title="6. 이용자의 권리 및 행사 방법">
                      이용자는 다음의 권리를 가집니다.<br/>
                      • 개인정보 열람, 정정·삭제, 처리 정지 요청권<br/>
                      • 위 권리 행사는 서비스 내 설정 메뉴 또는 이메일 문의를 통해 가능합니다.<br/>
                      • 문의 이메일: <strong>{ADMIN_EMAIL}</strong>
                    </Section>
      
                    <Section title="7. 쿠키(Cookie) 운용">
                      서비스는 로그인 상태 유지 등을 위해 쿠키를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.
                    </Section>
      
                    <Section title="8. 개인정보 보호 책임자">
                      • <strong>책임자:</strong> 같이가개 운영팀<br/>
                      • <strong>이메일:</strong> {ADMIN_EMAIL}<br/>
                      개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의해 주시기 바랍니다.
                    </Section>
      
                    <Section title="9. 개인정보 처리방침 변경">
                      본 방침은 법령, 정책 또는 서비스 변경 사항을 반영하기 위해 수정될 수 있습니다. 변경 시 서비스 내 공지사항을 통해 사전 안내합니다.
                    </Section>
      
                    <div style={{ marginTop:16, padding:"12px 14px", background:"#f8f9fb", borderRadius:10, border:"1px solid #e8eaed" }}>
                      <div style={{ fontSize:11, color:"#888", lineHeight:1.7 }}>
                        본 개인정보 처리방침은 <strong>2025년 1월 1일</strong>부터 적용됩니다.<br/>
                        문의사항이 있으시면 <strong>{ADMIN_EMAIL}</strong>로 연락해 주세요.
                      </div>
                    </div>
                  </div>
                </div>
              </>
            
          )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,

          color: "#111",

          marginBottom: 5,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#555",

          lineHeight: 1.8,
        }}
      >
        {children}
      </div>
    </div>
  );
}