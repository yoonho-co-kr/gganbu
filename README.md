# AION2 Party Builder

아이온2 캐릭터를 검색해 8인(4/4) 파티를 한 화면에서 여러 개 편성할 수 있는 Next.js 프로젝트입니다.

## 기능

- 캐릭터 검색 API (`/api/characters/search`)
  - 1차: `api.aon2.info` 검색
  - 2차: `aion2.plaync.com` 공식 검색 API
  - 3차: 공식 페이지 스크래핑 폴백
- 서버 목록 API (`/api/characters/servers`)
- 다중 파티 생성
- 8슬롯(1팀 4명 + 2팀 4명) 드래그앤드롭 편성
- 슬롯 간 이동/교체, 카드 풀로 드롭해 배치 해제
- 편성 상태 localStorage 저장
- 공유 링크 생성/조회 (`/api/share`, `/s/{id}`)

## 시작

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 검증

```bash
npm run lint
npm run build
```
