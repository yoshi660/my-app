import "dotenv/config";  // ← ①先頭に追加（.env の DATABASE_URL を読み込むため）
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,  // ← ②このブロックを追加
  },
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",  // ← ③ついでにこれも入れておくと seed が動く
  },
});