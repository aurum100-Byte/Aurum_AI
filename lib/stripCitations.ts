// web_search_preview 툴을 쓰면 모델이 프롬프트 지시를 무시하고 마크다운 링크/출처를
// 본문에 박아넣는 경우가 많아서, 응답 텍스트에서 링크를 강제로 제거한다.
// 채팅 응답(생성 시점)과 과거 메시지 일괄 정리(admin) 양쪽에서 사용.
export function stripCitations(text: string): string {
  return text
    // ([domain](https://...)) — 바깥 괄호까지 통째로 제거. ]와 ( 사이 줄바꿈 허용
    .replace(/\(\s*\[[^\]]*\]\s*\(https?:\/\/[^\s)]+\)\s*\)/g, "")
    // [text](https://...) — 마크다운 링크. ]와 ( 사이 줄바꿈 허용
    .replace(/\[[^\]]*\]\s*\(https?:\/\/[^\s)]+\)/g, "")
    // 【4:2†source】 스타일 인용 주석
    .replace(/【[^】]*】/g, "")
    // 남은 raw URL
    .replace(/https?:\/\/\S+/g, "")
    // 링크 제거 후 남는 빈 괄호
    .replace(/\(\s*\)/g, "")
    // 정리
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
