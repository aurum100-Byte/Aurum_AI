This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## YouTube 채널 자동 동기화

이미 학습된 채널들의 새 영상을 사람 손 없이 주기적으로 감지·학습한다.

1. **(최초 1회) 기존 채널 백필** — `uploads_playlist_id`, `last_synced_video_at`이 비어 있는 채널들을 채운다.
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/backfill-channels
   ```
2. **수동 동기화 테스트** — 관리 UI(`지금 새 영상 동기화` 버튼)를 누르거나 직접 호출:
   ```bash
   # 전체 active 채널
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/youtube/sync
   # 특정 채널만
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/youtube/sync?channelId=UCxxxxxx"
   ```
3. **자동화** — `vercel.json`에 등록된 Vercel Cron이 6시간마다 `/api/youtube/sync`를 호출한다 (스케줄은 `vercel.json`의 `crons[].schedule`에서 조정).

새 채널은 기존처럼 UI에서 채널 URL/핸들을 입력해 한 번 학습시키면, 이후로는 자동 추적된다 (`youtube_channels.is_active`를 false로 바꾸면 추적 중단).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
