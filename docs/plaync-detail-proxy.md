# PlayNC Detail Proxy

Vercel 배포 환경에서 `https://aion2.plaync.com/api/character/info`가 JSON 대신 HTML을 반환하는 경우, 별도 프록시를 통해 캐릭터 상세 스펙을 조회한다.

## Cloudflare Worker 배포

1. Cloudflare Workers에서 새 Worker를 만든다.
2. `workers/plaync-detail-proxy.ts` 내용을 Worker 코드로 배포한다.
3. 보안 토큰을 사용할 경우 Worker 환경변수에 `PLAYNC_PROXY_TOKEN`을 설정한다.
4. Worker URL 예시:

```txt
https://plaync-detail-proxy.example.workers.dev/
```

## Vercel 환경변수

Vercel 프로젝트 환경변수에 아래 값을 추가한다.

```txt
PLAYNC_DETAIL_PROXY_URL=https://plaync-detail-proxy.example.workers.dev/
PLAYNC_DETAIL_PROXY_TOKEN=Worker에 설정한 토큰
```

토큰을 사용하지 않으면 `PLAYNC_DETAIL_PROXY_TOKEN`은 비워도 된다.

## 확인 URL

```txt
https://gganbu-zikel.vercel.app/api/characters/search?name=%EB%A7%88%EB%8F%84%EC%A0%95&serverId=2002&size=5
```

정상 응답 예시:

```json
{
  "itemLevel": 2696,
  "combatPower": 146596,
  "warnings": []
}
```
